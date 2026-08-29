"""Monitor del servidor: métricas del SO (psutil), análisis de logs web por dominio
(detección de picos/ataques), y escáner de cambios de ficheros en los vhosts.
Todo es fail-safe: en preview (sin acceso a los logs/vhosts del VPS) devuelve
estructuras vacías con `available: False` y una nota explicativa."""
import os
import re
import time
import glob
import subprocess
from datetime import datetime, timezone
from collections import Counter, defaultdict


def _vhosts_path():
    return os.environ.get("VHOSTS_PATH", "/var/www/vhosts")


def _fmt_bytes(n):
    n = float(n or 0)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(n) < 1024.0:
            return f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} PB"


# ------------------------- métricas del sistema -------------------------
def system_metrics():
    import psutil
    cpu_pct = psutil.cpu_percent(interval=0.4)
    per_core = psutil.cpu_percent(interval=0, percpu=True)
    try:
        load1, load5, load15 = os.getloadavg()
    except Exception:  # noqa
        load1 = load5 = load15 = 0.0
    vm = psutil.virtual_memory()
    sm = psutil.swap_memory()

    disks = []
    seen = set()
    for part in psutil.disk_partitions(all=False):
        if part.mountpoint in seen:
            continue
        seen.add(part.mountpoint)
        try:
            u = psutil.disk_usage(part.mountpoint)
        except Exception:  # noqa
            continue
        disks.append({
            "mount": part.mountpoint, "device": part.device, "fstype": part.fstype,
            "total": u.total, "used": u.used, "free": u.free, "percent": u.percent,
            "totalH": _fmt_bytes(u.total), "usedH": _fmt_bytes(u.used), "freeH": _fmt_bytes(u.free),
        })

    boot = psutil.boot_time()
    uptime_s = int(time.time() - boot)

    # top procesos por CPU y memoria
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "memory_percent"]):
        try:
            procs.append(p.info)
        except Exception:  # noqa
            pass
    # cebar cpu_percent
    for p in psutil.process_iter():
        try:
            p.cpu_percent(None)
        except Exception:  # noqa
            pass
    time.sleep(0.15)
    cpu_map = {}
    for p in psutil.process_iter(["pid", "name"]):
        try:
            cpu_map[p.info["pid"]] = p.cpu_percent(None)
        except Exception:  # noqa
            pass
    ncpu = psutil.cpu_count() or 1
    for pr in procs:
        pr["cpu_percent"] = round((cpu_map.get(pr.get("pid"), 0.0)) / ncpu, 1)
        pr["memory_percent"] = round(pr.get("memory_percent") or 0.0, 1)
    top_cpu = sorted(procs, key=lambda x: x.get("cpu_percent", 0), reverse=True)[:6]
    top_mem = sorted(procs, key=lambda x: x.get("memory_percent", 0), reverse=True)[:6]

    net = psutil.net_io_counters()

    return {
        "cpu": {"percent": cpu_pct, "cores": ncpu, "perCore": per_core,
                "load": {"1m": round(load1, 2), "5m": round(load5, 2), "15m": round(load15, 2)}},
        "memory": {"total": vm.total, "used": vm.used, "available": vm.available, "percent": vm.percent,
                   "totalH": _fmt_bytes(vm.total), "usedH": _fmt_bytes(vm.used), "availableH": _fmt_bytes(vm.available)},
        "swap": {"total": sm.total, "used": sm.used, "percent": sm.percent,
                 "totalH": _fmt_bytes(sm.total), "usedH": _fmt_bytes(sm.used)},
        "disks": disks,
        "uptime": {"seconds": uptime_s, "bootTime": datetime.fromtimestamp(boot, timezone.utc).isoformat(),
                   "human": _human_uptime(uptime_s)},
        "network": {"sent": net.bytes_sent, "recv": net.bytes_recv,
                    "sentH": _fmt_bytes(net.bytes_sent), "recvH": _fmt_bytes(net.bytes_recv)},
        "topCpu": top_cpu, "topMem": top_mem,
        "host": os.uname().nodename if hasattr(os, "uname") else "",
        "now": datetime.now(timezone.utc).isoformat(),
    }


def _human_uptime(s):
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, _ = divmod(s, 60)
    parts = []
    if d:
        parts.append(f"{d}d")
    if h:
        parts.append(f"{h}h")
    parts.append(f"{m}m")
    return " ".join(parts)


# ------------------------- estado de servicios -------------------------
def service_status(services=None):
    """Comprueba servicios systemd (si está disponible). En preview no hay systemd → 'unknown'."""
    services = services or ["goroky-api", "nginx", "mariadb", "mysql", "postfix", "plesk-php"]
    out = []
    valid = {"active", "inactive", "failed", "activating", "deactivating", "reloading"}
    for svc in services:
        state = "unknown"
        try:
            r = subprocess.run(["systemctl", "is-active", svc], capture_output=True, text=True, timeout=4)
            val = (r.stdout or "").strip()
            state = val if val in valid else "unknown"
        except Exception:  # noqa
            state = "unknown"
        out.append({"name": svc, "state": state})
    return out


# ------------------------- análisis de logs web por dominio (ataques) -------------------------
_LOG_LINE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) (\S+)')

# rutas típicas de escaneo/ataque (WordPress, credenciales, shells, etc.)
_SENSITIVE = re.compile(
    r"(wp-login\.php|xmlrpc\.php|/wp-admin|/\.env|/\.git|/phpmyadmin|/pma|/administrator|"
    r"/admin\.php|/shell|/eval|/\.aws|/config\.php|/vendor/|/\.ssh|/setup\.php|/boaform|"
    r"/cgi-bin|/wp-content/uploads/.*\.php|/\.well-known/.*\.php)", re.I)


def domain_traffic(max_lines=4000, top_n=12):
    """Recorre los access logs de cada vhost, cuenta peticiones recientes, top IPs y
    marca posibles ataques explicando el porqué (razones)."""
    base = _vhosts_path()
    if not os.path.isdir(base):
        return {"available": False,
                "note": f"No hay acceso a {base} (solo disponible en el VPS con Plesk).",
                "domains": []}
    domains = []
    try:
        entries = sorted(os.listdir(base))
    except Exception as e:  # noqa
        return {"available": False, "note": str(e)[:160], "domains": []}

    for dom in entries:
        logs_dir = os.path.join(base, dom, "logs")
        if not os.path.isdir(logs_dir):
            continue
        log_files = []
        for pat in ("access_ssl_log", "access_log", "proxy_access_ssl_log", "proxy_access_log"):
            fp = os.path.join(logs_dir, pat)
            if os.path.isfile(fp):
                log_files.append(fp)
        if not log_files:
            continue
        lines = []
        for fp in log_files:
            try:
                lines += _tail(fp, max_lines // max(len(log_files), 1))
            except Exception:  # noqa
                pass
        if not lines:
            continue
        ip_counter = Counter()
        status_counter = Counter()
        path_counter = Counter()
        errors = 0
        not_found = 0
        sensitive_hits = 0
        sensitive_paths = Counter()
        for ln in lines:
            m = _LOG_LINE.match(ln)
            if not m:
                continue
            ip, _ts, _method, path, status, _size = m.groups()
            ip_counter[ip] += 1
            status_counter[status] += 1
            path_counter[path[:80]] += 1
            if status and status[0] in ("4", "5"):
                errors += 1
            if status == "404":
                not_found += 1
            if _SENSITIVE.search(path):
                sensitive_hits += 1
                sensitive_paths[path[:80]] += 1
        total = sum(ip_counter.values())
        if total == 0:
            continue
        top_ip = ip_counter.most_common(1)[0] if ip_counter else ("", 0)
        ip_share = (top_ip[1] / total) if total else 0
        err_rate = errors / total if total else 0
        nf_rate = not_found / total if total else 0

        # razones del "posible ataque"
        reasons = []
        if top_ip[1] > 300 and ip_share > 0.4:
            reasons.append(f"La IP {top_ip[0]} concentra el {round(ip_share*100)}% del tráfico ({top_ip[1]} peticiones) — posible fuerza bruta o DoS.")
        if err_rate > 0.5 and total > 200:
            reasons.append(f"Tasa de errores muy alta: {round(err_rate*100)}% ({errors} de {total}).")
        if nf_rate > 0.4 and total > 200:
            reasons.append(f"Muchos 404 ({round(nf_rate*100)}%) — típico de un escáner buscando rutas vulnerables.")
        if sensitive_hits > 20:
            top_sens = ", ".join(p for p, _ in sensitive_paths.most_common(3))
            reasons.append(f"{sensitive_hits} peticiones a rutas sensibles (p. ej. {top_sens}).")

        suspicious = len(reasons) > 0
        severity = "high" if (top_ip[1] > 1000 or sensitive_hits > 100 or (err_rate > 0.7 and total > 500)) else ("medium" if suspicious else "ok")
        domains.append({
            "domain": dom, "requests": total, "errors": errors,
            "errorRate": round(errors / total * 100, 1),
            "notFound": not_found,
            "topIps": [{"ip": ip, "hits": c} for ip, c in ip_counter.most_common(5)],
            "topPaths": [{"path": p, "hits": c} for p, c in path_counter.most_common(5)],
            "sensitivePaths": [{"path": p, "hits": c} for p, c in sensitive_paths.most_common(5)],
            "statusCodes": dict(status_counter.most_common(6)),
            "suspicious": suspicious, "severity": severity, "reasons": reasons,
        })
    domains.sort(key=lambda d: (d["suspicious"], d["requests"]), reverse=True)
    return {"available": True, "sampleLines": max_lines, "domains": domains[:top_n]}


def _tail(path, n):
    """Últimas n líneas de un fichero de log (eficiente para ficheros grandes)."""
    n = max(n, 50)
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            block = 4096
            data = b""
            while size > 0 and data.count(b"\n") <= n:
                step = min(block, size)
                size -= step
                f.seek(size)
                data = f.read(step) + data
            return data.decode("utf-8", "replace").splitlines()[-n:]
    except Exception:  # noqa
        return []


# ------------------------- disco por dominio (uso de recursos) -------------------------
def domain_disk_usage(top_n=15):
    base = _vhosts_path()
    if not os.path.isdir(base):
        return {"available": False,
                "note": f"No hay acceso a {base} (solo disponible en el VPS).",
                "domains": []}
    out = []
    try:
        entries = sorted(os.listdir(base))
    except Exception as e:  # noqa
        return {"available": False, "note": str(e)[:160], "domains": []}
    for dom in entries:
        d = os.path.join(base, dom)
        if not os.path.isdir(d) or dom.startswith("."):
            continue
        try:
            r = subprocess.run(["du", "-sb", d], capture_output=True, text=True, timeout=20)
            size = int((r.stdout or "0").split()[0]) if r.stdout.strip() else 0
        except Exception:  # noqa
            size = 0
        out.append({"domain": dom, "bytes": size, "human": _fmt_bytes(size)})
    out.sort(key=lambda x: x["bytes"], reverse=True)
    return {"available": True, "domains": out[:top_n]}


# ------------------------- cambios de ficheros (integridad / intrusiones) -------------------------
def recent_file_changes(hours=24, limit=200):
    base = _vhosts_path()
    if not os.path.isdir(base):
        return {"available": False,
                "note": f"No hay acceso a {base} (solo disponible en el VPS).",
                "files": []}
    cutoff = time.time() - hours * 3600
    changes = []
    skip_dirs = {"logs", "statistics", "tmp", ".cache", "node_modules", "vendor"}
    try:
        domains = sorted(os.listdir(base))
    except Exception as e:  # noqa
        return {"available": False, "note": str(e)[:160], "files": []}
    for dom in domains:
        droot = os.path.join(base, dom, "httpdocs")
        if not os.path.isdir(droot):
            droot = os.path.join(base, dom)
        if not os.path.isdir(droot):
            continue
        for root, dirs, files in os.walk(droot):
            dirs[:] = [d for d in dirs if d not in skip_dirs and not d.startswith(".")]
            for fn in files:
                fp = os.path.join(root, fn)
                try:
                    st = os.stat(fp)
                except Exception:  # noqa
                    continue
                if st.st_mtime >= cutoff:
                    changes.append({
                        "domain": dom, "path": fp.replace(base + "/", ""),
                        "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                        "size": st.st_size, "sizeH": _fmt_bytes(st.st_size),
                        "suspicious": fn.endswith((".php", ".sh", ".py", ".cgi", ".pl")),
                    })
                if len(changes) >= limit * 4:
                    break
    changes.sort(key=lambda c: c["mtime"], reverse=True)
    return {"available": True, "hours": hours, "count": len(changes), "files": changes[:limit]}
