"""Monitor de bases de datos (MySQL/MariaDB), servicios systemd, apps del VPS y
puertos a la escucha. Todo READ-ONLY y fail-safe: en preview (sin MySQL/systemd)
devuelve `available: False` con una nota. NUNCA modifica datos."""
import os
import subprocess
from server_monitor import _fmt_bytes


# ------------------------- MySQL / MariaDB (solo lectura) -------------------------
def _psa_shadow():
    """En Plesk, la contraseña de root de MySQL está en /etc/psa/.psa.shadow (requiere root)."""
    try:
        with open("/etc/psa/.psa.shadow") as f:
            return f.read().strip()
    except Exception:  # noqa
        return None


def _mysql_config(cfg=None):
    cfg = cfg or {}
    host = cfg.get("mysqlHost") or os.environ.get("MYSQL_HOST") or "127.0.0.1"
    user = cfg.get("mysqlUser") or os.environ.get("MYSQL_USER") or "admin"
    pw = cfg.get("mysqlPassword") or os.environ.get("MYSQL_PASSWORD") or _psa_shadow()
    port = int(cfg.get("mysqlPort") or os.environ.get("MYSQL_PORT") or 3306)
    return host, user, pw, port


def mysql_stats(cfg=None):
    host, user, pw, port = _mysql_config(cfg)
    if not pw:
        return {"available": False,
                "note": "MySQL/MariaDB no configurado. En el VPS se detecta automáticamente (Plesk) o configura usuario/clave."}
    try:
        import pymysql
        conn = pymysql.connect(host=host, user=user, password=pw, port=port,
                               connect_timeout=6, read_timeout=8)
    except Exception as e:  # noqa
        return {"available": False, "note": f"No se pudo conectar a MySQL ({host}:{port}): {str(e)[:140]}"}
    try:
        cur = conn.cursor()
        cur.execute("SELECT VERSION()")
        version = cur.fetchone()[0]
        cur.execute("""SELECT table_schema, SUM(data_length+index_length) s, COUNT(*) t
                       FROM information_schema.tables GROUP BY table_schema ORDER BY s DESC""")
        dbs = [{"name": r[0], "bytes": int(r[1] or 0), "human": _fmt_bytes(r[1] or 0), "tables": int(r[2] or 0)}
               for r in cur.fetchall()]
        status = {}
        cur.execute("""SHOW GLOBAL STATUS WHERE Variable_name IN
                       ('Uptime','Threads_connected','Threads_running','Queries','Slow_queries',
                        'Connections','Aborted_connects','Max_used_connections')""")
        for k, v in cur.fetchall():
            status[k] = v
        maxconn = 0
        cur.execute("SHOW VARIABLES LIKE 'max_connections'")
        row = cur.fetchone()
        if row:
            maxconn = int(row[1])
        cur.close()
        conn.close()
        total_bytes = sum(d["bytes"] for d in dbs)
        return {"available": True, "version": version, "host": host,
                "databases": dbs, "totalBytes": total_bytes, "totalHuman": _fmt_bytes(total_bytes),
                "uptime": int(status.get("Uptime", 0) or 0),
                "threadsConnected": int(status.get("Threads_connected", 0) or 0),
                "threadsRunning": int(status.get("Threads_running", 0) or 0),
                "maxConnections": maxconn,
                "maxUsedConnections": int(status.get("Max_used_connections", 0) or 0),
                "queries": int(status.get("Queries", 0) or 0),
                "slowQueries": int(status.get("Slow_queries", 0) or 0),
                "connections": int(status.get("Connections", 0) or 0),
                "abortedConnects": int(status.get("Aborted_connects", 0) or 0)}
    except Exception as e:  # noqa
        try:
            conn.close()
        except Exception:  # noqa
            pass
        return {"available": False, "note": f"Error consultando MySQL: {str(e)[:140]}"}


# ------------------------- servicios systemd (todos) -------------------------
def _svc_memory(name):
    try:
        r = subprocess.run(["systemctl", "show", name, "-p", "MemoryCurrent", "--value"],
                           capture_output=True, text=True, timeout=4)
        val = (r.stdout or "").strip()
        if val.isdigit():
            return int(val)
    except Exception:  # noqa
        pass
    return None


def all_services():
    out = []
    try:
        r = subprocess.run(["systemctl", "list-units", "--type=service", "--all",
                           "--no-legend", "--plain", "--no-pager"],
                          capture_output=True, text=True, timeout=8)
        for line in r.stdout.splitlines():
            parts = line.split(None, 4)
            if len(parts) < 4 or not parts[0].endswith(".service"):
                continue
            out.append({"name": parts[0][:-8], "load": parts[1], "state": parts[2], "sub": parts[3]})
    except Exception:  # noqa
        return {"available": False, "note": "systemd no disponible (solo en el VPS)", "services": []}
    return {"available": True, "services": out}


def app_services(keywords):
    """Agrupa los servicios systemd por app (tramilex, goroky, ingresoqr, gym24, mvg…)."""
    data = all_services()
    if not data.get("available"):
        return {"available": False, "note": data.get("note"), "apps": {}}
    svcs = data["services"]
    apps = {}
    matched = set()
    for kw in keywords:
        ms = [s for s in svcs if kw.lower() in s["name"].lower()]
        for s in ms:
            s["memory"] = _svc_memory(s["name"])
            s["memoryH"] = _fmt_bytes(s["memory"]) if s["memory"] else "—"
            matched.add(s["name"])
        apps[kw] = ms
    running = sorted([s for s in svcs if s["state"] == "active"], key=lambda x: x["name"])
    return {"available": True, "apps": apps, "runningCount": len(running),
            "totalCount": len(svcs), "running": running}


# ------------------------- puertos a la escucha -------------------------
def listening_ports():
    out = []
    try:
        r = subprocess.run(["ss", "-tlnpH"], capture_output=True, text=True, timeout=5)
        lines = r.stdout.splitlines()
        if not lines:
            raise RuntimeError("empty")
    except Exception:  # noqa
        try:
            r = subprocess.run(["netstat", "-tlnp"], capture_output=True, text=True, timeout=5)
            lines = [ln for ln in r.stdout.splitlines() if "LISTEN" in ln]
        except Exception:  # noqa
            return {"available": False, "note": "ss/netstat no disponible (solo en el VPS)", "ports": []}
    for ln in lines:
        parts = ln.split()
        local = ""
        proc = ""
        for p in parts:
            if ":" in p and (p.count(".") >= 3 or p.startswith("[") or p.startswith("*") or p[0].isdigit() or p.startswith("0")):
                local = p
        if "users:" in ln:
            proc = ln.split("users:", 1)[1][:80]
        elif "/" in parts[-1]:
            proc = parts[-1]
        port = local.rsplit(":", 1)[-1] if ":" in local else local
        out.append({"local": local, "port": port, "process": proc})
    # dedupe por puerto
    seen = set()
    uniq = []
    for p in out:
        if p["port"] in seen:
            continue
        seen.add(p["port"])
        uniq.append(p)
    uniq.sort(key=lambda x: (len(x["port"]), x["port"]))
    return {"available": True, "ports": uniq}
