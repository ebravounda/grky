"""Generación del contrato de servicios PDF (formato Goroky) con plantilla editable."""
import io
import re
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

# Plantilla por defecto (editable desde el panel admin en /contract-template).
# Los textos admiten placeholders: {issuerBrand} {issuerLegal} {issuerCif} {issuerAddr}
# {customerName} {fiscalId} {customerAddress} {customerEmail} {customerPhone}
# {productName} {lineNumber} {price}
DEFAULT_TEMPLATE = {
    "title": "CONTRATO DE PRESTACIÓN DE SERVICIOS",
    "subtitle": "DE COMUNICACIONES ELECTRÓNICAS",
    "issuerBrand": "GOROKY",
    "issuerLegal": "TRAMILEX GLOBAL SERVICE SL",
    "issuerCif": "B21796925",
    "issuerAddr": "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)",
    "reunidosOperator": "De una parte, {issuerLegal} (marca comercial {issuerBrand}), con CIF {issuerCif} y domicilio en {issuerAddr}, en adelante EL OPERADOR.",
    "reunidosClient": "Y de otra parte, {customerName}, con NIF/CIF {fiscalId}, domicilio en {customerAddress}, email {customerEmail} y teléfono {customerPhone}, en adelante EL CLIENTE.",
    "clauses": [
        {"title": "1. Objeto", "body": "EL OPERADOR prestará a EL CLIENTE los servicios de comunicaciones electrónicas indicados en los datos del servicio, conforme a las condiciones generales publicadas en GOROKY.COM."},
        {"title": "2. Precio y facturación", "body": "EL CLIENTE abonará la cuota mensual indicada, impuestos incluidos, mediante el método de pago acordado. La facturación es mensual y las facturas se emiten y remiten en formato electrónico."},
        {"title": "3. Duración y permanencia", "body": "El contrato tiene duración indefinida. Salvo promoción con compromiso de permanencia expresamente aceptada, EL CLIENTE podrá darse de baja en cualquier momento con un preaviso de dos (2) días hábiles."},
        {"title": "4. Protección de datos", "body": "Los datos de EL CLIENTE serán tratados por EL OPERADOR con la finalidad de gestionar la prestación del servicio y la facturación, conforme al RGPD. EL CLIENTE podrá ejercer sus derechos según la política de privacidad."},
        {"title": "5. Desistimiento", "body": "En contratación a distancia, EL CLIENTE dispone de 14 días naturales para desistir del contrato, salvo que el servicio se haya ejecutado completamente con su consentimiento previo."},
    ],
}

BLUE = colors.HexColor("#0033ff")
ORANGE = colors.HexColor("#ff7a00")
DARK = colors.HexColor("#0b1020")
GREY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f1f3f7")
LINE = colors.HexColor("#d9dde5")

W, H = A4
LM = 18 * mm
RM = W - 18 * mm


def _fmt_date(iso):
    if not iso:
        return datetime.now().strftime("%d/%m/%Y")
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return iso[:10]


def _subst(text, ctx):
    """Reemplaza {placeholders} por valores del contexto (los desconocidos quedan vacíos)."""
    if not text:
        return ""
    return re.sub(r"\{(\w+)\}", lambda m: str(ctx.get(m.group(1), "")), text)


def _header(c, tpl):
    brand = tpl.get("issuerBrand", "GOROKY")
    half = max(1, len(brand) // 2)
    p1, p2 = brand[:half], brand[half:]
    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(BLUE); c.drawString(LM, H - 20 * mm, p1)
    w = c.stringWidth(p1, "Helvetica-Bold", 20)
    c.setFillColor(ORANGE); c.drawString(LM + w, H - 20 * mm, p2)
    c.setFont("Helvetica", 8); c.setFillColor(GREY)
    c.drawRightString(RM, H - 16 * mm, tpl.get("issuerLegal", ""))
    c.drawRightString(RM, H - 20 * mm, f"CIF {tpl.get('issuerCif', '')}")
    c.drawRightString(RM, H - 24 * mm, tpl.get("issuerAddr", ""))


def _footer(c, page, tpl):
    c.setStrokeColor(LINE); c.line(LM, 16 * mm, RM, 16 * mm)
    c.setFillColor(GREY); c.setFont("Helvetica", 7)
    c.drawString(LM, 12 * mm, f"{tpl.get('issuerLegal', '')} · CIF {tpl.get('issuerCif', '')}")
    c.drawRightString(RM, 12 * mm, f"Página {page}")


def _wrap(c, text, x, y, max_w, font="Helvetica", size=9, lh=None):
    lh = lh or (size + 3)
    c.setFont(font, size)
    for para in (text or "").split("\n"):
        words = para.split()
        line = ""
        for wd in words:
            test = (line + " " + wd).strip()
            if c.stringWidth(test, font, size) > max_w:
                c.drawString(x, y, line); y -= lh; line = wd
            else:
                line = test
        c.drawString(x, y, line); y -= lh
    return y


def generate_contract_pdf(ct: dict, tpl: dict = None) -> bytes:
    tpl = {**DEFAULT_TEMPLATE, **(tpl or {})}
    ctx = dict(ct)
    ctx.update({
        "issuerBrand": tpl.get("issuerBrand", ""), "issuerLegal": tpl.get("issuerLegal", ""),
        "issuerCif": tpl.get("issuerCif", ""), "issuerAddr": tpl.get("issuerAddr", ""),
        "price": f"{ct.get('price', 0):.2f}",
    })

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _header(c, tpl)

    y = H - 38 * mm
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(W / 2, y, tpl.get("title", ""))
    c.setFont("Helvetica", 9); c.setFillColor(GREY)
    y -= 6 * mm
    c.drawCentredString(W / 2, y, tpl.get("subtitle", ""))
    y -= 8 * mm
    c.setFillColor(DARK); c.setFont("Helvetica", 9)
    c.drawString(LM, y, f"Nº de contrato: {ct.get('contractNumber', '')}")
    c.drawRightString(RM, y, f"Fecha: {_fmt_date(ct.get('date'))}")
    y -= 4 * mm
    c.setStrokeColor(LINE); c.line(LM, y, RM, y)
    y -= 8 * mm

    # PARTES
    c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 10)
    c.drawString(LM, y, "REUNIDOS"); y -= 6 * mm
    c.setFillColor(DARK)
    y = _wrap(c, _subst(tpl.get("reunidosOperator"), ctx), LM, y, RM - LM); y -= 2 * mm
    y = _wrap(c, _subst(tpl.get("reunidosClient"), ctx), LM, y, RM - LM); y -= 6 * mm

    # DATOS DEL SERVICIO (caja)
    c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 10)
    c.drawString(LM, y, "DATOS DEL SERVICIO CONTRATADO"); y -= 6 * mm
    box_h = 30 * mm
    c.setFillColor(LIGHT); c.roundRect(LM, y - box_h, RM - LM, box_h, 4, fill=1, stroke=0)
    c.setFillColor(DARK); c.setFont("Helvetica", 9)
    rows = [
        ("Producto / tarifa", ct.get("productName", "")),
        ("Tipo de servicio", "Móvil" if ct.get("family") == "Mobile" else ("Fibra" if ct.get("family") == "Fiber" else ct.get("family", ""))),
        ("Número de línea", ct.get("lineNumber", "")),
        ("Cuota mensual", f"{ct.get('price', 0):.2f} € (IVA incl.)"),
        ("Portabilidad", "Sí" if ct.get("portability") else "No (numeración nueva)"),
        ("Operador donante", ct.get("donorOperator", "—") if ct.get("portability") else "—"),
    ]
    ry = y - 6 * mm
    for i, (k, v) in enumerate(rows):
        cx = LM + 4 * mm if i % 2 == 0 else LM + (RM - LM) / 2 + 2 * mm
        if i % 2 == 0 and i > 0:
            ry -= 8 * mm
        c.setFillColor(GREY); c.setFont("Helvetica", 8); c.drawString(cx, ry, k)
        c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9); c.drawString(cx, ry - 4.5 * mm, str(v))
    y = y - box_h - 8 * mm

    # CLÁUSULAS
    c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 10)
    c.drawString(LM, y, "CLÁUSULAS"); y -= 6 * mm
    for clause in tpl.get("clauses", []):
        title = clause.get("title", "") if isinstance(clause, dict) else ""
        body = clause.get("body", "") if isinstance(clause, dict) else ""
        if y < 45 * mm:
            _footer(c, 1, tpl); c.showPage(); _header(c, tpl); y = H - 40 * mm
        c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9)
        c.drawString(LM, y, title); y -= 5 * mm
        c.setFillColor(GREY)
        y = _wrap(c, _subst(body, ctx), LM, y, RM - LM, size=8.5); y -= 3 * mm

    # FIRMAS
    if y < 45 * mm:
        _footer(c, 1, tpl); c.showPage(); _header(c, tpl); y = H - 45 * mm
    y -= 6 * mm
    c.setStrokeColor(LINE)
    c.line(LM, y, LM + 60 * mm, y)
    c.line(RM - 60 * mm, y, RM, y)
    c.setFillColor(GREY); c.setFont("Helvetica", 8)
    c.drawString(LM, y - 5 * mm, "EL OPERADOR")
    c.drawString(RM - 60 * mm, y - 5 * mm, "EL CLIENTE")
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9)
    c.drawString(LM, y + 3 * mm, tpl.get("issuerBrand", ""))
    c.drawString(RM - 60 * mm, y + 3 * mm, ct.get("customerName", ""))
    # Firma del cliente (imagen dibujada o nombre escrito)
    sig = ct.get("signatureImage")
    if sig and isinstance(sig, str) and sig.startswith("data:"):
        try:
            import base64 as _b64
            from reportlab.lib.utils import ImageReader
            raw = _b64.b64decode(sig.split(",", 1)[1])
            img = ImageReader(io.BytesIO(raw))
            c.drawImage(img, RM - 60 * mm, y + 6 * mm, width=45 * mm, height=16 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    elif ct.get("signerName"):
        c.setFillColor(DARK); c.setFont("Helvetica-Oblique", 13)
        c.drawString(RM - 60 * mm, y + 8 * mm, ct["signerName"])
    if ct.get("signed"):
        c.setFillColor(colors.HexColor("#16a34a")); c.setFont("Helvetica-Oblique", 8)
        c.drawString(RM - 60 * mm, y + 22 * mm, "Firmado digitalmente")

    _footer(c, 1, tpl)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()
