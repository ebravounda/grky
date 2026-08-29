"""Monitor del servidor: métricas del SO (psutil), análisis de logs web por dominio
(detección de picos/ataques), y escáner de cambios de ficheros en los vhosts.
Todo es fail-safe: en preview (sin acceso a los logs/vhosts del VPS) devuelve
estructuras vacías con `available: False` y una nota explicativa."""
import os
import re
import time
import glob
import subprocess
from urllib.parse import unquote
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
# Formato de log (CLF/combined): capta IP, timestamp, método, ruta, estado y user-agent (si existe)
_LOG_LINE = re.compile(
    r'^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) (\S+)(?: "[^"]*" "([^"]*)")?')

# rutas sensibles típicas de escaneo de vulnerabilidades
_SENSITIVE = re.compile(
    r"(wp-login\.php|xmlrpc\.php|/wp-admin|/\.env|/\.git|/phpmyadmin|/pma\b|/administrator|"
    r"/admin\.php|/shell|/\.aws|/config\.php|/vendor/|/\.ssh|/setup\.php|/boaform|/manager/html|"
    r"/cgi-bin|/wp-content/uploads/.*\.php|/\.well-known/.*\.php|/solr/|/actuator|/console)", re.I)

# endpoints de autenticación (fuerza bruta)
_AUTH = re.compile(r"(wp-login\.php|xmlrpc\.php|/login|/signin|/wp-json/.*users|/administrator|/user/login|/admin/login)", re.I)

# firmas de inyección (SQLi / XSS / LFI / RCE) en la ruta o query
_INJECT = re.compile(
    r"(union[\s/*]+select|select.+from\s|information_schema|sleep\(|benchmark\(|"
    r"<script|%3cscript|onerror=|javascript:|"
    r"\.\./\.\./|/etc/passwd|/etc/shadow|c:\\\\windows|"
    r"base64_decode|eval\(|system\(|exec\(|passthru\(|shell_exec|/bin/sh|wget\s|curl\s|\bor\b\s+1=1)", re.I)

# crawlers legítimos conocidos (informativo; no evita el flag si hay firmas de ataque)
_KNOWN_BOT = re.compile(r"(googlebot|bingbot|yandexbot|duckduckbot|applebot|facebookexternalhit|ahrefsbot|semrushbot|uptimerobot|pingdom)", re.I)


def _parse_ts(s):
    """'29/Aug/2026:10:00:00 +0000' → epoch (float). None si no parsea."""
    try:
        return datetime.strptime(s, "%d/%b/%Y:%H:%M:%S %z").timestamp()
    except Exception:  # noqa
        return None


def domain_traffic(max_lines=20000, top_n=15, window_minutes=60,
                   flood_rpm=120, auth_threshold=30, scan_threshold=25,
                   inject_threshold=5, min_events=150, whitelist=None):
    """Análisis PRECISO por IP y ventana de tiempo. Solo marca ataque cuando hay una FIRMA
    clara (fuerza bruta, escaneo de vulnerabilidades, inyección o flood), con evidencia y
    nivel de confianza — para minimizar falsos positivos."""
    base = _vhosts_path()
    whitelist = set(whitelist or [])
    if not os.path.isdir(base):
        return {"available": False,
                "note": f"No hay acceso a {base} (solo disponible en el VPS con Plesk).",
                "domains": [], "attackers": []}
    try:
        entries = sorted(os.listdir(base))
    except Exception as e:  # noqa
        return {"available": False, "note": str(e)[:160], "domains": [], "attackers": []}

    domains = []
    all_attackers = []
    for dom in entries:
        logs_dir = os.path.join(base, dom, "logs")
        if not os.path.isdir(logs_dir):
            continue
        lines = []
        log_names = ("access_ssl_log", "access_log", "proxy_access_ssl_log", "proxy_access_log")
        present = [os.path.join(logs_dir, n) for n in log_names if os.path.isfile(os.path.join(logs_dir, n))]
        if not present:
            continue
        for fp in present:
            try:
                lines += _tail(fp, max_lines // max(len(present), 1))
            except Exception:  # noqa
                pass
        if not lines:
            continue

        # 1) parsear y quedarnos con la ventana de tiempo real más reciente
        parsed = []
        latest = None
        for ln in lines:
            m = _LOG_LINE.match(ln)
            if not m:
                continue
            ip, ts_s, method, path, status, _size, ua = m.groups()
            ts = _parse_ts(ts_s)
            parsed.append((ip, ts, method, path or "", status, ua or ""))
            if ts and (latest is None or ts > latest):
                latest = ts
        if not parsed:
            continue
        cutoff = (latest - window_minutes * 60) if latest else None
        recent = [r for r in parsed if (r[1] is None or cutoff is None or r[1] >= cutoff)]
        if not recent:
            recent = parsed

        # 2) agregación por IP
        ips = defaultdict(lambda: {"count": 0, "status": Counter(), "paths": Counter(),
                                   "auth": 0, "scan": 0, "inject": 0, "notfound": 0,
                                   "first": None, "last": None, "ua": Counter(), "distinct": set()})
        status_counter = Counter()
        path_counter = Counter()
        errors = 0
        not_found = 0
        for ip, ts, method, path, status, ua in recent:
            d = ips[ip]
            d["count"] += 1
            d["status"][status] += 1
            d["paths"][path[:100]] += 1
            d["distinct"].add(path.split("?")[0][:100])
            if ua:
                d["ua"][ua[:60]] += 1
            if ts:
                d["first"] = ts if d["first"] is None else min(d["first"], ts)
                d["last"] = ts if d["last"] is None else max(d["last"], ts)
            status_counter[status] += 1
            path_counter[path[:80]] += 1
            if status and status[0] in ("4", "5"):
                errors += 1
            if status == "404":
                not_found += 1
                d["notfound"] += 1
            if _AUTH.search(path) and method in ("POST", "PUT"):
                d["auth"] += 1
            if _SENSITIVE.search(path) and status in ("404", "403", "401"):
                d["scan"] += 1
            if _INJECT.search(unquote(path)):
                d["inject"] += 1

        total = sum(d["count"] for d in ips.values())
        if total == 0:
            continue

        # 3) evaluar cada IP contra firmas de ataque
        span_min = max((latest - min((d["first"] for d in ips.values() if d["first"]), default=latest)) / 60.0, 1.0) if latest else float(window_minutes)
        flagged = []
        for ip, d in ips.items():
            if ip in whitelist:
                continue
            dur = max(((d["last"] - d["first"]) / 60.0) if (d["first"] and d["last"]) else span_min, 1.0)
            rpm = d["count"] / dur
            reasons = []
            kinds = []
            if d["auth"] >= auth_threshold:
                reasons.append(f"{d['auth']} intentos de autenticación (POST a login) — fuerza bruta.")
                kinds.append("brute_force")
            if d["scan"] >= scan_threshold:
                top_s = ", ".join(p for p, _ in d["paths"].most_common(3))
                reasons.append(f"{d['scan']} accesos fallidos a rutas sensibles (escaneo de vulnerabilidades). Ej.: {top_s}")
                kinds.append("vuln_scan")
            if d["inject"] >= inject_threshold:
                reasons.append(f"{d['inject']} peticiones con firmas de inyección (SQLi/XSS/LFI/RCE).")
                kinds.append("injection")
            if rpm >= flood_rpm and d["count"] >= min_events:
                reasons.append(f"{round(rpm)} peticiones/min sostenidas ({d['count']} en {round(dur)} min) — flood/DoS.")
                kinds.append("flood")
            if not reasons:
                continue
            # confianza: alta si múltiples señales o volumen muy alto
            strong = len(kinds) >= 2 or d["auth"] >= auth_threshold * 3 or d["scan"] >= scan_threshold * 3 or rpm >= flood_rpm * 2
            flagged.append({
                "ip": ip, "kinds": kinds, "reasons": reasons,
                "requests": d["count"], "rpm": round(rpm, 1),
                "authAttempts": d["auth"], "scanHits": d["scan"], "injectHits": d["inject"],
                "notFound": d["notfound"],
                "confidence": "high" if strong else "medium",
                "userAgent": (d["ua"].most_common(1)[0][0] if d["ua"] else ""),
                "knownBot": bool(d["ua"] and _KNOWN_BOT.search(" ".join(d["ua"]))),
                "samplePaths": [{"path": p, "hits": c} for p, c in d["paths"].most_common(5)],
            })

        flagged.sort(key=lambda x: (x["confidence"] == "high", x["requests"]), reverse=True)
        suspicious = len(flagged) > 0
        severity = "high" if any(f["confidence"] == "high" for f in flagged) else ("medium" if suspicious else "ok")
        for f in flagged:
            all_attackers.append({**f, "domain": dom})

        domains.append({
            "domain": dom, "windowMinutes": window_minutes,
            "requests": total, "uniqueIps": len(ips), "errors": errors,
            "errorRate": round(errors / total * 100, 1), "notFound": not_found,
            "topIps": [{"ip": ip, "hits": d["count"]} for ip, d in sorted(ips.items(), key=lambda x: x[1]["count"], reverse=True)[:5]],
            "topPaths": [{"path": p, "hits": c} for p, c in path_counter.most_common(6)],
            "statusCodes": dict(status_counter.most_common(6)),
            "suspicious": suspicious, "severity": severity,
            "flaggedIps": flagged,
            "reasons": [f"IP {f['ip']}: {f['reasons'][0]}" for f in flagged[:4]],
        })

    domains.sort(key=lambda d: ({"high": 2, "medium": 1, "ok": 0}[d["severity"]], d["requests"]), reverse=True)
    all_attackers.sort(key=lambda x: (x["confidence"] == "high", x["requests"]), reverse=True)
    return {"available": True, "windowMinutes": window_minutes, "sampleLines": max_lines,
            "attackers": all_attackers[:40], "domains": domains[:top_n]}


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
