"""Monitor de seguridad en tiempo real (8 secciones). Todo es fail-safe: si falta una
herramienta o permiso devuelve listas vacías con una nota, nunca rompe la API."""
import os
import re
import glob
import pwd
import time
import hashlib
import subprocess
from datetime import datetime, timezone

SUSPICIOUS_PORTS = {22: "SSH saliente", 23: "Telnet", 3333: "Minería", 4444: "Minería / shell remota",
                    5555: "Minería", 7777: "Minería", 14444: "Minería (Monero)", 6667: "IRC (servidor de control)"}
NORMAL_PORTS = {443, 80, 53, 123, 25, 587, 465, 993, 995, 143, 110, 3306, 27017, 8443, 8880}
MAIL_PROCS = {"master", "smtp", "smtpd", "postfix", "qmgr", "cleanup", "local", "bounce", "pickup", "lmtp"}
KNOWN_PROCS = MAIL_PROCS | {
    "sshd", "nginx", "httpd", "apache2", "php-fpm", "php", "mysqld", "mariadbd", "mongod", "python", "python3",
    "python3.11", "uvicorn", "node", "sw-engine", "sw-cp-server", "sw-engine-fpm", "psa", "plesk", "imunify-service",
    "imunify-agent", "imunify360-agent", "aibolit", "amazon-ssm-agent", "ssm-agent-worker", "ssm-session-worker",
    "systemd-resolve", "systemd-resolved", "chronyd", "ntpd", "dovecot", "imap", "imap-login", "pop3-login", "auth",
    "named", "fail2ban-server", "dnf", "yum", "rpm", "packagekitd", "cloudflared", "certbot", "letsencrypt",
    "rsyslogd", "systemd", "systemd-timesyncd", "crond", "cron", "atd", "spamd", "clamd", "freshclam", "wdcollect",
    "dhclient", "NetworkManager", "tuned", "firewalld", "iptables", "sw-collectd", "grafana", "monit", "git", "pip",
    "yarn", "dockerd", "containerd", "supervisord", "redis-server", "memcached", "opendkim", "milter", "greylist",
}
PHP_RX = re.compile(r"^(php|php-fpm|php-cgi|lsphp|php\d|php\d\.\d|php-fpm\d.*)", re.I)
SHELL_LIKE = {"perl", "python", "python2", "python3", "bash", "sh", "dash", "zsh", "nc", "ncat", "netcat", "socat",
              "curl", "wget", "ruby", "node", "telnet", "ssh", "xmrig", "kworker"}
TMP_DIRS = ("/tmp", "/var/tmp", "/dev/shm")
SYSTEM_USERS = {"root", "postfix", "mysql", "nginx", "apache", "psaadm", "psaftp", "psaserv", "popuser", "named",
                "chrony", "dovecot", "dovenull", "mongod", "nobody", "systemd-resolve", "systemd-network", "dbus",
                "polkitd", "sw-cp-server", "ntp", "redis", "memcached", "imunify360", "_imunify", "clamupdate",
                "opendkim", "drweb", "psacln", "lp", "mail"}


def _run(cmd, timeout=8):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except Exception:  # noqa
        return ""


def _user(uid):
    try:
        p = pwd.getpwuid(int(uid))
        return p.pw_name, p.pw_dir
    except Exception:  # noqa
        return str(uid), ""


def _site_of(home):
    m = re.match(r"^/var/www/vhosts/([^/]+)", home or "")
    return m.group(1) if m else ""


def _is_web_user(uid, name, home):
    try:
        uid = int(uid)
    except Exception:  # noqa
        return False
    return uid >= 1000 and name not in SYSTEM_USERS or home.startswith("/var/www/vhosts")


def fp(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:16]


def _split_hostport(s):
    s = s.strip()
    if s.startswith("["):
        host, _, port = s[1:].partition("]:")
    else:
        host, _, port = s.rpartition(":")
    return host.replace("::ffff:", ""), int(port) if port.isdigit() else 0


def _is_private(ip):
    return ip.startswith(("127.", "10.", "192.168.", "169.254.")) or ip in ("::1", "*", "0.0.0.0") or \
        re.match(r"^172\.(1[6-9]|2\d|3[01])\.", ip) is not None


def _listening_ports():
    ports = set()
    for ln in _run(["ss", "-tlnH"]).splitlines():
        cols = ln.split()
        if len(cols) >= 4:
            ports.add(_split_hostport(cols[3])[1])
    return ports


# ----------------------------- 1 y 2 · conexiones -----------------------------
def connections():
    out = _run(["ss", "-tnpeH", "state", "established", "state", "syn-sent"])
    listen = _listening_ports()
    rows = []
    for ln in out.splitlines():
        cols = ln.split()
        off = 0 if cols[0].isdigit() else 1  # con varios "state" ss añade la columna State
        if len(cols) < 4 + off:
            continue
        local, peer = cols[2 + off], cols[3 + off]
        lip, lport = _split_hostport(local)
        rip, rport = _split_hostport(peer)
        if lport in listen or _is_private(rip):
            continue  # entrante a un servicio nuestro o tráfico local
        m = re.search(r'users:\(\("([^"]+)",pid=(\d+)', ln)
        proc, pid = (m.group(1), int(m.group(2))) if m else ("?", None)
        um = re.search(r"\buid:(\d+)", ln)
        uid = int(um.group(1)) if um else 0
        uname, home = _user(uid)
        reasons = []
        if rport in SUSPICIOUS_PORTS:
            reasons.append(f"Puerto {rport}: {SUSPICIOUS_PORTS[rport]}")
        if rport in (25, 587, 465) and proc not in MAIL_PROCS:
            reasons.append(f"Envío de correo desde '{proc}' (no es postfix)")
        if proc not in KNOWN_PROCS and not PHP_RX.match(proc):
            reasons.append(f"Proceso desconocido '{proc}'")
        if rport not in NORMAL_PORTS and rport not in SUSPICIOUS_PORTS and not reasons:
            reasons.append(f"Puerto poco habitual {rport}")
        web = _is_web_user(uid, uname, home)
        if web and rport not in (443, 80):
            reasons.append(f"Usuario web '{uname}' conectando al puerto {rport}")
        rows.append({"proc": proc, "pid": pid, "uid": uid, "user": uname, "site": _site_of(home),
                     "local": f"{lip}:{lport}", "remote": rip, "port": rport, "webUser": web,
                     "suspicious": bool(reasons), "reasons": reasons,
                     "fp": fp("conn", proc, uname, rport)})
    rows.sort(key=lambda r: (not r["suspicious"], r["port"], r["proc"]))
    return rows


# ----------------------------- 3 · trampa -----------------------------
def trap(prefix=None, hours=24):
    lines = _run(["journalctl", "-k", "--since", f"-{hours}h", "--no-pager", "-o", "short-iso"], timeout=15).splitlines()
    if not lines:
        for f in ("/var/log/messages", "/var/log/kern.log", "/var/log/syslog"):
            try:
                with open(f, errors="ignore") as fh:
                    lines = fh.readlines()[-20000:]
                break
            except Exception:  # noqa
                continue
    pref = (prefix or "").strip()
    rows = []
    for ln in lines:
        if pref:
            if pref not in ln:
                continue
        elif not ("UID=" in ln and ("DPT=" in ln or "OUT=" in ln)):
            continue
        uid = re.search(r"\bUID=(\d+)", ln)
        dst = re.search(r"\bDST=([\d.:a-f]+)", ln)
        dpt = re.search(r"\bDPT=(\d+)", ln)
        uname, home = _user(uid.group(1)) if uid else ("", "")
        rows.append({"line": ln.strip()[:400], "uid": int(uid.group(1)) if uid else None, "user": uname,
                     "site": _site_of(home), "dst": dst.group(1) if dst else "", "port": int(dpt.group(1)) if dpt else None,
                     "time": ln[:25], "fp": fp("trap", ln.strip()[:200])})
    return rows[-200:][::-1]


# ----------------------------- 4, 5 y 6 · procesos -----------------------------
def processes():
    import psutil
    web_procs, tmp_procs, cpu = [], [], []
    procs = list(psutil.process_iter(["pid", "name", "username", "uids", "exe", "cmdline", "cwd", "create_time"]))
    for p in procs:
        try:
            p.cpu_percent(None)
        except Exception:  # noqa
            pass
    time.sleep(0.6)
    for p in procs:
        try:
            info = p.info
            uid = info["uids"].real if info.get("uids") else 0
            uname, home = _user(uid)
            name = info.get("name") or ""
            exe = info.get("exe") or ""
            cwd = info.get("cwd") or ""
            cmd = " ".join(info.get("cmdline") or [])[:300]
            row = {"pid": info["pid"], "name": name, "user": uname, "uid": uid, "site": _site_of(home),
                   "exe": exe, "cmd": cmd, "since": datetime.fromtimestamp(info.get("create_time") or 0, tz=timezone.utc).isoformat()}
            if _is_web_user(uid, uname, home) and not PHP_RX.match(name):
                why = "intérprete/shell" if name.split(".")[0] in SHELL_LIKE else "binario no-PHP"
                web_procs.append({**row, "reason": f"Usuario web ejecutando {why}", "fp": fp("webproc", uname, name, exe)})
            if exe.startswith(TMP_DIRS) or cwd.startswith(TMP_DIRS) or "(deleted)" in exe or \
                    any(a.startswith(TMP_DIRS) for a in (info.get("cmdline") or [])[:2]):
                tmp_procs.append({**row, "reason": "Ejecutándose desde /tmp, /var/tmp o /dev/shm" if "(deleted)" not in exe else "Binario borrado del disco",
                                  "fp": fp("tmpproc", uname, name, exe)})
            c = p.cpu_percent(None)
            if c >= 5:
                known = name in KNOWN_PROCS or PHP_RX.match(name) is not None
                cpu.append({**row, "cpu": round(c, 1), "known": known,
                            "suspicious": c >= 80 and not known, "fp": fp("cpu", uname, name, exe)})
        except Exception:  # noqa
            continue
    cpu.sort(key=lambda r: -r["cpu"])
    return web_procs, tmp_procs, cpu[:15]


# ----------------------------- 7 · persistencia -----------------------------
def persistence(days=7):
    since = time.time() - days * 86400
    rows = []
    pats = ["/etc/systemd/system/*.service", "/etc/systemd/system/*.timer", "/etc/systemd/system/*/*.service",
            "/etc/crontab", "/etc/cron.d/*", "/etc/cron.hourly/*", "/etc/cron.daily/*", "/var/spool/cron/*",
            "/var/spool/cron/crontabs/*", "/etc/rc.local", "/etc/rc.d/rc.local", "/etc/ld.so.preload",
            "/root/.ssh/authorized_keys", "/home/*/.ssh/authorized_keys", "/var/www/vhosts/*/.ssh/authorized_keys",
            "/etc/profile.d/*", "/root/.bashrc", "/etc/sudoers.d/*"]
    for pat in pats:
        for f in glob.glob(pat):
            try:
                st = os.stat(f)
            except Exception:  # noqa
                continue
            if st.st_mtime < since or os.path.isdir(f):
                continue
            kind = "cron" if "cron" in f else "ssh" if "authorized_keys" in f else "systemd" if "systemd" in f else "arranque"
            try:
                with open(f, errors="ignore") as fh:
                    preview = "".join([ln for ln in fh.readlines() if ln.strip() and not ln.startswith("#")][:6])[:500]
            except Exception:  # noqa
                preview = ""
            known = "block-outbound-ssh" in f or "block-outbound-ssh" in preview
            rows.append({"path": f, "kind": kind, "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                         "preview": preview, "known": known, "fp": fp("persist", f, int(st.st_mtime))})
    rows.sort(key=lambda r: r["modified"], reverse=True)
    return rows


# ----------------------------- 8 · logins -----------------------------
def logins(trusted_ips=None, days=7):
    trusted = {i.strip() for i in (trusted_ips or []) if i.strip()}
    rows, seen = [], set()
    out = _run(["journalctl", "--since", f"-{days}d", "--no-pager", "-o", "short-iso", "-t", "sshd", "-g", "Accepted"], timeout=15)
    if not out:
        for f in ("/var/log/secure", "/var/log/auth.log"):
            try:
                with open(f, errors="ignore") as fh:
                    out = "".join([ln for ln in fh.readlines()[-20000:] if "Accepted" in ln])
                break
            except Exception:  # noqa
                continue
    for ln in out.splitlines():
        m = re.search(r"Accepted (\S+) for (\S+) from ([\da-fA-F.:]+)", ln)
        if not m:
            continue
        method, user, ip = m.groups()
        if ip in trusted:
            continue
        key = (user, ip, ln[:16])
        if key in seen:
            continue
        seen.add(key)
        rows.append({"time": ln[:25], "user": user, "ip": ip, "method": method, "source": "ssh",
                     "nonRoot": user != "root", "fp": fp("login", user, ip, ln[:19])})
    for ln in _run(["who", "--ips"]).splitlines():
        cols = ln.split()
        if len(cols) >= 5:
            ip = cols[-1].strip("()")
            if ip in trusted:
                continue
            rows.append({"time": " ".join(cols[2:4]), "user": cols[0], "ip": ip, "method": "sesión activa", "source": "who",
                         "nonRoot": cols[0] != "root", "fp": fp("who", cols[0], ip, cols[2], cols[3])})
    return rows[::-1][:100]


def collect(cfg):
    import shutil
    available = bool(shutil.which("ss"))
    conns = connections() if available else []
    web, tmp, cpu = processes()
    return {
        "available": available,
        "at": datetime.now(timezone.utc).isoformat(),
        "outbound": conns,
        "nonRoot": [c for c in conns if c["uid"] != 0],
        "trap": trap(cfg.get("trapPrefix")),
        "webProcs": web,
        "tmpProcs": tmp,
        "cpu": cpu,
        "persistence": persistence(),
        "logins": logins(cfg.get("trustedIps") or []),
    }


def findings(data, acked):
    """Elementos sospechosos (para alertas). Excluye lo marcado como revisado."""
    out = []
    for c in data["outbound"]:
        if c["suspicious"]:
            out.append((c["fp"], f"Conexión sospechosa: {c['proc']} ({c['user']}) → {c['remote']}:{c['port']} · {', '.join(c['reasons'])}"))
    for t in data["trap"][:20]:
        out.append((t["fp"], f"TRAMPA: intento bloqueado de UID {t['uid']} ({t['user']} {t['site']}) → {t['dst']}:{t['port']}"))
    for p in data["webProcs"] + data["tmpProcs"]:
        out.append((p["fp"], f"Proceso raro: {p['name']} (usuario {p['user']} {p['site']}) · {p['reason']} · {p['cmd'][:120]}"))
    for p in data["cpu"]:
        if p["suspicious"]:
            out.append((p["fp"], f"CPU alta: {p['name']} ({p['user']}) al {p['cpu']}% · posible minero"))
    for f in data["persistence"]:
        if not f["known"]:
            out.append((f["fp"], f"Persistencia: modificado {f['path']} ({f['kind']})"))
    for lg in data["logins"]:
        out.append((lg["fp"], f"Login: {lg['user']} desde {lg['ip']} ({lg['method']})"))
    return [(k, msg) for k, msg in out if k not in acked]
