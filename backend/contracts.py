"""Contrato de alta PDF (réplica del contrato oficial GoRoky) con plantilla 100% editable."""
import io
import os
import re
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "goroky_logo.png")

# Plantilla por defecto (editable desde el panel admin en Contenido → Contrato).
# Placeholders admitidos en cualquier texto:
#   {issuerBrand} {issuerLegal} {issuerCif} {issuerAddr}
#   {supportPhone} {supportEmail} {supportHours} {website}
#   {customerName} {fiscalId} {docLabel} {customerAddress} {shippingAddress} {nationality}
#   {customerEmail} {customerPhone} {contractNumber} {date}
#   {productName} {lineNumber} {price} {priceBase} {priceIva} {priceTotal}
DEFAULT_TEMPLATE = {
    "issuerBrand": "GOROKY",
    "issuerLegal": "TRAMILEX GLOBAL SERVICE SL",
    "issuerCif": "B21796925",
    "issuerAddr": "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)",
    "supportPhone": "931204745",
    "supportEmail": "soporte@goroky.com",
    "supportHours": "9:00 a 21:00",
    "website": "GOROKY.COM",
    "contractTitle": "Contrato de alta",
    "sec1Title": "Datos de tu Contrato",
    "welcomeText": (
        "Hola {customerName}, ¡bienvenid@ a {issuerBrand}!\n\n"
        "Muchas gracias por contratar tus líneas con {issuerLegal}. Este es tu Contrato, "
        "que hemos preparado de una forma clara y sencilla para que puedas entender todo fácilmente. "
        "Siempre podrás añadir más servicios o modificar los existentes.\n\n"
        "En cualquier caso, si tienes alguna duda o necesitas ayuda técnica puedes ponerte en contacto con nosotros:\n"
        "Por teléfono: {supportPhone} en el siguiente horario: {supportHours}\n"
        "Por correo electrónico: {supportEmail}\n\n"
        "Con la firma de este Contrato estás aceptando las condiciones legales de las tarifas (condiciones generales "
        "de contratación y particulares de los servicios contratados) que puedes encontrar aquí: {website}"
    ),
    "sec2Title": "Nuestros Datos",
    "ourDataText": (
        "Los Servicios de Móvil que has contratado son comercializados por {issuerBrand} ({issuerLegal} con CIF "
        "{issuerCif}) en nombre y por cuenta de XFERA MÓVILES, S.A.U con CIF A82528548 como operador prestador de los "
        "servicios de telecomunicaciones que comercializa los Servicios a través de Likes Telecom (EZ EASY TELECOM SL "
        "con CIF B09883612) quien realizará la gestión de la facturación y cobro en nombre y por cuenta de XFERA "
        "MÓVILES, S.A.U. El operador de red móvil es XFERA MÓVILES, S.A.U. con CIF A82528548 y domicilio social en "
        "Parque Empresarial \"La Finca\", Paseo del Club Deportivo, 1, Edif. 8, 28223 Pozuelo de Alarcón, (Madrid - España)."
    ),
    "sec3Title": "Tus Datos",
    "sec4Title": "Importe total del Contrato",
    "sec5Title": "Lo que vas a tener",
    "servicesIntro": "Servicios que has contratado:",
    "servicesNote": (
        "IVA incluido. Precios en Euros. Las promociones y descuentos se aplicarán siempre que la activación de las "
        "líneas, que se producirá tras la firma del contrato, se realice dentro del periodo de vigencia de las mismas y "
        "aplicarán en sus términos previstos siempre que se cumplan todas las estipulaciones incluidas en las "
        "condiciones legales de las tarifas contratadas."
    ),
    "sec6Title": "Lo que tienes que saber y aceptar",
    "knowAcceptText": (
        "Firmando este documento suscribes el presente Contrato (que comprende el presente Formulario de Contratación, "
        "los Formularios en su caso de solicitud de portabilidad de numeraciones fijas y/o móvil, las Condiciones "
        "Generales y Particulares de Contratación, las Condiciones Específicas del Servicio de Telefonía Fija, Internet "
        "y/o Móvil y de TV anexas y las Condiciones Legales de las Tarifas Contratadas, que como abonado conoces y "
        "aceptas) con la Compañía {issuerBrand} ({issuerLegal} con CIF {issuerCif}), como comercializador autorizado "
        "que actúa en nombre y por cuenta de Likes Telecom (EZ EASY TELECOM SL con CIF B09883612) en el caso de "
        "servicios propios o, en su caso, que comercializa los Servicios en nombre y por cuenta de los operadores "
        "prestadores de los servicios identificados en el apartado \"NUESTROS DATOS\"."
    ),
    "dataProtectionText": (
        "Tratamiento de datos de carácter personal: Tus datos de carácter personal que nos hayas facilitado y sean "
        "necesarios para prestar los Servicios objeto del contrato serán incorporados a un fichero de tratamiento de "
        "datos. Consiento que {issuerBrand} y EZ Easy Telecom, S.L. traten mis datos de contacto (nombre, teléfono y "
        "correo electrónico) para enviarme comunicaciones comerciales sobre productos y servicios propios o "
        "comercializados por empresas de sus grupos y colaboradores comerciales. Puede revocar este consentimiento en "
        "cualquier momento escribiendo a privacy@goroky.com y dpo@likestelecom.com sin que ello afecte a la licitud del "
        "tratamiento previo. En cualquier momento puedes ejercitar tus derechos de acceso, rectificación, cancelación y "
        "oposición mediante petición escrita junto con una fotocopia de tu DNI dirigida a privacy@goroky.com."
    ),
    "acceptanceText": (
        "Acepto las Condiciones Generales y Particulares de Contratación, el tratamiento de datos asociado y solicito "
        "que el servicio esté disponible una vez activado."
    ),
    "electronicText": (
        "Si el Contrato se suscribe a través de proceso electrónico, la aceptación de alguna o todas de las anteriores "
        "casillas quedará reflejada en las evidencias electrónicas de la firma del contrato, que el cliente puede "
        "solicitar contactando con {website}."
    ),
    "linksText": (
        "Puedes consultar todas las condiciones en los siguientes enlaces:\n"
        "Condiciones generales de contratación: {website}\n"
        "Condiciones particulares de contratación: {website}\n"
        "Precios de servicios de TARIFICACIÓN ESPECIAL: {website}\n"
        "Precios de llamadas INTERNACIONALES: {website}\n"
        "Precios y países de llamadas ROAMING: {website}"
    ),
    "avisoTitle": "Aviso Legal",
    "avisoSections": [
        {"title": "Servicios de móvil y fibra:", "body": "El operador de red móvil es XFERA MÓVILES, S.A.U. con CIF A82528548 y domicilio social en Parque Empresarial \"La Finca\", Paseo del Club Deportivo, 1, Edif. 8, 28223 - Pozuelo de Alarcón (Madrid - España)."},
        {"title": "Servicio de TV OTT:", "body": "MEDIOS AUDIOVISUALES MASMEDIA SL con CIF B88644828 como prestatario del servicio de TV OTT. Resto de servicios que no son de telecomunicaciones son comercializados por la marca."},
        {"title": "Datos de carácter personal.", "body": "En cualquier momento puedes ejercitar tus derechos de acceso, rectificación, cancelación y oposición, mediante petición escrita junto con una fotocopia de tu DNI dirigida a privacy@goroky.com."},
        {"title": "Reclamaciones.", "body": "El abonado deberá dirigirse al departamento o servicio especializado de atención al cliente en el plazo de un mes desde que se tenga conocimiento del hecho que motive su reclamación. Si en el plazo de un mes el usuario no hubiera recibido respuesta satisfactoria, podrá dirigir su reclamación a: Secretaría de Estado de Telecomunicaciones e Infraestructuras Digitales (901 33 66 99; http://www.usuariosteleco.es); Juntas Arbitrales de Consumo."},
        {"title": "Impago.", "body": "El presente aviso legal sirve como comunicación fehaciente al abonado en caso de impago. Transcurrido 1 mes desde el impago se notificará por SMS o email la suspensión temporal del servicio. Transcurridos tres meses sin pago se podrá interrumpir definitivamente el servicio, dando de baja la línea y el contrato, con previo aviso de 48 horas."},
    ],
    "footerText": "Tel. {supportPhone}  Email: {supportEmail}   ·   {issuerLegal}, con CIF {issuerCif} y domicilio social en {issuerAddr}.",
}

BLUE = colors.HexColor("#0033ff")
ORANGE = colors.HexColor("#ff7a00")
DARK = colors.HexColor("#0b1020")
GREY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f4f6fb")
LINE = colors.HexColor("#d9dde5")
GREEN = colors.HexColor("#16a34a")

W, H = A4
LM = 18 * mm
RM = W - 18 * mm
TOP = H - 34 * mm
BOTTOM = 22 * mm
CW = RM - LM


def _fmt_date(iso):
    if not iso:
        return datetime.now().strftime("%d/%m/%Y")
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return str(iso)[:10]


def _subst(text, ctx):
    if not text:
        return ""
    return re.sub(r"\{(\w+)\}", lambda m: str(ctx.get(m.group(1), "")), str(text))


class _Doc:
    """Renderer con paginación automática, cabecera con logo y pie en todas las páginas."""

    def __init__(self, tpl, ctx):
        self.tpl = tpl
        self.ctx = ctx
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=A4)
        self.page = 1
        self.y = TOP
        self._header()

    def _header(self):
        c = self.c
        drew_logo = False
        if os.path.exists(_LOGO_PATH):
            try:
                c.drawImage(ImageReader(_LOGO_PATH), LM, H - 26 * mm, width=42 * mm, height=14 * mm,
                            preserveAspectRatio=True, mask="auto")
                drew_logo = True
            except Exception:
                drew_logo = False
        if not drew_logo:
            brand = self.tpl.get("issuerBrand", "GOROKY")
            half = max(1, len(brand) // 2)
            c.setFont("Helvetica-Bold", 20)
            c.setFillColor(BLUE); c.drawString(LM, H - 20 * mm, brand[:half])
            w = c.stringWidth(brand[:half], "Helvetica-Bold", 20)
            c.setFillColor(ORANGE); c.drawString(LM + w, H - 20 * mm, brand[half:])
        c.setFont("Helvetica", 7.5); c.setFillColor(GREY)
        c.drawString(LM, H - 30 * mm, f"{self.tpl.get('issuerLegal', '')} · CIF {self.tpl.get('issuerCif', '')}")
        # bloque derecho: título + nº contrato + fecha
        c.setFont("Helvetica-Bold", 13); c.setFillColor(DARK)
        c.drawRightString(RM, H - 16 * mm, self.tpl.get("contractTitle", "Contrato de alta"))
        c.setFont("Helvetica", 7.5); c.setFillColor(GREY)
        c.drawRightString(RM, H - 21 * mm, f"Nº de contrato: {self.ctx.get('contractNumber', '')}")
        c.drawRightString(RM, H - 25 * mm, f"Fecha: {self.ctx.get('date', '')}")
        c.setStrokeColor(LINE); c.line(LM, H - 32 * mm, RM, H - 32 * mm)

    def _footer(self):
        c = self.c
        c.setStrokeColor(LINE); c.line(LM, 18 * mm, RM, 18 * mm)
        c.setFillColor(GREY); c.setFont("Helvetica", 6.8)
        _wrap_static(c, _subst(self.tpl.get("footerText", ""), self.ctx), LM, 14 * mm, CW, size=6.8, lh=8, color=GREY)
        c.drawRightString(RM, 14 * mm, f"Pág. {self.page}")

    def new_page(self):
        self._footer(); self.c.showPage(); self.page += 1; self.y = TOP; self._header()

    def ensure(self, need):
        if self.y - need < BOTTOM:
            self.new_page()

    def gap(self, mm_):
        self.y -= mm_ * mm

    def section(self, text):
        self.ensure(12 * mm)
        self.c.setFillColor(BLUE); self.c.setFont("Helvetica-Bold", 12)
        self.c.drawString(LM, self.y, text); self.y -= 7 * mm

    def subheading(self, text):
        self.ensure(8 * mm)
        self.c.setFillColor(DARK); self.c.setFont("Helvetica-Bold", 9.5)
        self.c.drawString(LM, self.y, text); self.y -= 5 * mm

    def para(self, text, size=9, color=DARK, bold=False):
        font = "Helvetica-Bold" if bold else "Helvetica"
        lh = size + 3.5
        for line in _lines(self.c, _subst(text, self.ctx), CW, font, size):
            self.ensure(lh + 2)
            self.c.setFillColor(color); self.c.setFont(font, size)
            self.c.drawString(LM, self.y, line); self.y -= lh
        self.y -= 2

    def save(self):
        self._footer(); self.c.showPage(); self.c.save(); self.buf.seek(0)
        return self.buf.read()


def _lines(c, text, max_w, font, size):
    out = []
    for para in (text or "").split("\n"):
        if para == "":
            out.append("")
            continue
        words, line = para.split(), ""
        for wd in words:
            test = (line + " " + wd).strip()
            if c.stringWidth(test, font, size) > max_w and line:
                out.append(line); line = wd
            else:
                line = test
        out.append(line)
    return out


def _wrap_static(c, text, x, y, max_w, font="Helvetica", size=8, lh=None, color=DARK):
    lh = lh or (size + 3)
    c.setFont(font, size); c.setFillColor(color)
    for line in _lines(c, text, max_w, font, size):
        c.drawString(x, y, line); y -= lh
    return y


def generate_contract_pdf(ct: dict, tpl: dict = None) -> bytes:
    tpl = {**DEFAULT_TEMPLATE, **(tpl or {})}
    price = float(ct.get("price", 0) or 0)
    base = ct.get("priceBase")
    if base is None:
        base = round(price / 1.21, 2)
    iva = ct.get("priceIva")
    if iva is None:
        iva = round(price - base, 2)
    fam = ct.get("family")
    fam_label = {"Mobile": "Móvil", "Fiber": "Fibra", "TV": "TV", "Satellite": "Satélite"}.get(fam, fam or "Servicio")
    doc_label = ct.get("docLabel") or "NIF/CIF"
    ctx = dict(ct)
    ctx.update({
        "issuerBrand": tpl.get("issuerBrand", ""), "issuerLegal": tpl.get("issuerLegal", ""),
        "issuerCif": tpl.get("issuerCif", ""), "issuerAddr": tpl.get("issuerAddr", ""),
        "supportPhone": tpl.get("supportPhone", ""), "supportEmail": tpl.get("supportEmail", ""),
        "supportHours": tpl.get("supportHours", ""), "website": tpl.get("website", ""),
        "date": _fmt_date(ct.get("date")), "price": f"{price:.2f}",
        "priceBase": f"{base:.2f}", "priceIva": f"{iva:.2f}", "priceTotal": f"{price:.2f}",
        "docLabel": doc_label, "familyLabel": fam_label,
    })

    d = _Doc(tpl, ctx)

    # 1) Datos de tu Contrato
    d.section(tpl.get("sec1Title", "Datos de tu Contrato"))
    d.para(tpl.get("welcomeText", ""), size=9)
    d.gap(2)

    # 2) Nuestros Datos
    d.section(tpl.get("sec2Title", "Nuestros Datos"))
    d.para(tpl.get("ourDataText", ""), size=8.5, color=GREY)
    d.gap(2)

    # 3) Tus Datos (caja de dos columnas)
    d.section(tpl.get("sec3Title", "Tus Datos"))
    fields = [
        ("CLIENTE", ct.get("customerName", "")),
        (doc_label, ct.get("fiscalId", "")),
        ("NACIONALIDAD", ct.get("nationality", "España")),
        ("TELÉFONO / EMAIL", f"{ct.get('customerPhone', '')}  {ct.get('customerEmail', '')}".strip()),
        ("DIRECCIÓN DE FACTURACIÓN", ct.get("customerAddress", "")),
        ("DIRECCIÓN PARA ENVÍOS", ct.get("shippingAddress") or ct.get("customerAddress", "")),
    ]
    d.ensure(38 * mm)
    box_top = d.y
    col_w = CW / 2
    row_h = 12 * mm
    rows = (len(fields) + 1) // 2
    box_h = rows * row_h + 3 * mm
    d.c.setFillColor(LIGHT); d.c.roundRect(LM, box_top - box_h, CW, box_h, 4, fill=1, stroke=0)
    for i, (k, v) in enumerate(fields):
        col = i % 2
        row = i // 2
        cx = LM + 4 * mm + col * col_w
        cy = box_top - 6 * mm - row * row_h
        d.c.setFillColor(GREY); d.c.setFont("Helvetica", 7); d.c.drawString(cx, cy, k)
        d.c.setFillColor(DARK); d.c.setFont("Helvetica-Bold", 8.5)
        for j, ln in enumerate(_lines(d.c, str(v), col_w - 6 * mm, "Helvetica-Bold", 8.5)[:2]):
            d.c.drawString(cx, cy - 4 * mm - j * 3.6 * mm, ln)
    d.y = box_top - box_h - 6 * mm

    # 4) Importe total
    d.section(tpl.get("sec4Title", "Importe total del Contrato"))
    for k, v in [("Precio sin IVA", ctx["priceBase"]), ("IVA (21%)", ctx["priceIva"]), ("Precio total", ctx["priceTotal"])]:
        d.ensure(6 * mm)
        bold = k == "Precio total"
        d.c.setFont("Helvetica-Bold" if bold else "Helvetica", 9.5)
        d.c.setFillColor(BLUE if bold else DARK); d.c.drawString(LM, d.y, k)
        d.c.setFillColor(BLUE if bold else DARK); d.c.drawRightString(RM, d.y, f"{v} €")
        d.y -= 6 * mm
    d.gap(2)

    # 5) Lo que vas a tener (tabla de servicios)
    d.section(f"{tpl.get('sec5Title', 'Lo que vas a tener')} de {fam_label}")
    d.subheading(tpl.get("servicesIntro", "Servicios que has contratado:"))
    products = ct.get("products") or [{
        "number": ct.get("lineNumber", ""), "name": ct.get("productName", ""),
        "permanence": ct.get("permanence", ""), "price": price,
    }]
    # cabecera de tabla
    d.ensure(10 * mm)
    cols = [LM + 2 * mm, LM + 34 * mm, RM - 46 * mm, RM - 2 * mm]
    d.c.setFillColor(GREY); d.c.setFont("Helvetica-Bold", 7.5)
    d.c.drawString(cols[0], d.y, "Número"); d.c.drawString(cols[1], d.y, "Producto")
    d.c.drawString(cols[2], d.y, "Perm. (meses)"); d.c.drawRightString(cols[3], d.y, "Precio (€)")
    d.y -= 4 * mm
    d.c.setStrokeColor(LINE); d.c.line(LM, d.y, RM, d.y); d.y -= 5 * mm
    for p in products:
        d.ensure(9 * mm)
        d.c.setFillColor(DARK); d.c.setFont("Helvetica", 8)
        d.c.drawString(cols[0], d.y, str(p.get("number") or "—"))
        name_lines = _lines(d.c, str(p.get("name", "")), cols[2] - cols[1] - 4 * mm, "Helvetica", 8)
        d.c.drawString(cols[1], d.y, name_lines[0] if name_lines else "")
        d.c.drawString(cols[2], d.y, str(p.get("permanence") or "—"))
        d.c.setFont("Helvetica-Bold", 8); d.c.drawRightString(cols[3], d.y, f"{float(p.get('price', 0) or 0):.2f} €/mes")
        d.y -= 4 * mm
        for extra in name_lines[1:2]:
            d.c.setFont("Helvetica", 8); d.c.setFillColor(DARK)
            d.c.drawString(cols[1], d.y, extra); d.y -= 4 * mm
    d.y -= 2 * mm
    d.c.setStrokeColor(LINE); d.c.line(LM, d.y, RM, d.y); d.y -= 5 * mm
    d.c.setFillColor(DARK); d.c.setFont("Helvetica-Bold", 9)
    d.c.drawString(LM, d.y, f"Subtotal {fam_label}")
    d.c.setFillColor(BLUE); d.c.drawRightString(RM, d.y, f"{price:.2f} €/mes"); d.y -= 6 * mm
    d.para(tpl.get("servicesNote", ""), size=7.5, color=GREY)
    d.gap(2)

    # 6) Lo que tienes que saber y aceptar
    d.section(tpl.get("sec6Title", "Lo que tienes que saber y aceptar"))
    d.para(tpl.get("knowAcceptText", ""), size=8, color=GREY)
    d.para(tpl.get("dataProtectionText", ""), size=8, color=GREY)
    d.gap(1)
    # casilla de aceptación
    d.ensure(9 * mm)
    d.c.setStrokeColor(BLUE); d.c.setFillColor(colors.white)
    d.c.rect(LM, d.y - 3 * mm, 3.4 * mm, 3.4 * mm, fill=0, stroke=1)
    d.c.setFillColor(GREEN); d.c.setFont("Helvetica-Bold", 8); d.c.drawString(LM + 0.6 * mm, d.y - 2.6 * mm, "✓")
    saved_y = d.y
    ay = _wrap_static(d.c, _subst(tpl.get("acceptanceText", ""), ctx), LM + 6 * mm, d.y, CW - 6 * mm, size=8, color=DARK)
    d.y = ay - 4 * mm
    d.para(tpl.get("electronicText", ""), size=7.5, color=GREY)
    d.para(tpl.get("linksText", ""), size=7.5, color=GREY)

    # Firma
    d.ensure(34 * mm)
    d.gap(4)
    sig_y = d.y
    d.c.setFillColor(GREY); d.c.setFont("Helvetica-Bold", 8)
    d.c.drawString(RM - 62 * mm, sig_y, "FIRMA CLIENTE")
    d.c.drawString(LM, sig_y, "FECHA")
    d.c.setFillColor(DARK); d.c.setFont("Helvetica", 9)
    d.c.drawString(LM, sig_y - 6 * mm, ctx.get("date", ""))
    sig = ct.get("signatureImage")
    if sig and isinstance(sig, str) and sig.startswith("data:"):
        try:
            import base64 as _b64
            raw = _b64.b64decode(sig.split(",", 1)[1])
            d.c.drawImage(ImageReader(io.BytesIO(raw)), RM - 62 * mm, sig_y - 22 * mm,
                          width=50 * mm, height=18 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    elif ct.get("signerName"):
        d.c.setFillColor(DARK); d.c.setFont("Helvetica-Oblique", 13)
        d.c.drawString(RM - 62 * mm, sig_y - 14 * mm, ct["signerName"])
    if ct.get("signed"):
        d.c.setStrokeColor(LINE); d.c.line(RM - 62 * mm, sig_y - 24 * mm, RM, sig_y - 24 * mm)
        d.c.setFillColor(GREEN); d.c.setFont("Helvetica-Oblique", 7.5)
        d.c.drawString(RM - 62 * mm, sig_y - 28 * mm, "Firmado digitalmente")
    d.y = sig_y - 34 * mm

    # Aviso legal
    d.section(tpl.get("avisoTitle", "Aviso Legal"))
    for s in (tpl.get("avisoSections") or []):
        if isinstance(s, dict):
            if s.get("title"):
                d.subheading(_subst(s["title"], ctx))
            d.para(s.get("body", ""), size=7.8, color=GREY)

    return d.save()
