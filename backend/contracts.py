"""Generación del contrato de servicios PDF (formato Goroky)."""
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

ISSUER_BRAND = "GOROKY"
ISSUER_LEGAL = "TRAMILEX GLOBAL SERVICE SL"
ISSUER_CIF = "B21796925"
ISSUER_ADDR = "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)"

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


def _header(c):
    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(BLUE); c.drawString(LM, H - 20 * mm, "Goro")
    w = c.stringWidth("Goro", "Helvetica-Bold", 20)
    c.setFillColor(ORANGE); c.drawString(LM + w, H - 20 * mm, "ky")
    c.setFont("Helvetica", 8); c.setFillColor(GREY)
    c.drawRightString(RM, H - 16 * mm, ISSUER_LEGAL)
    c.drawRightString(RM, H - 20 * mm, f"CIF {ISSUER_CIF}")
    c.drawRightString(RM, H - 24 * mm, ISSUER_ADDR)


def _footer(c, page):
    c.setStrokeColor(LINE); c.line(LM, 16 * mm, RM, 16 * mm)
    c.setFillColor(GREY); c.setFont("Helvetica", 7)
    c.drawString(LM, 12 * mm, f"{ISSUER_LEGAL} · CIF {ISSUER_CIF}")
    c.drawRightString(RM, 12 * mm, f"Página {page}")


def _wrap(c, text, x, y, max_w, font="Helvetica", size=9, lh=None):
    lh = lh or (size + 3)
    c.setFont(font, size)
    for para in text.split("\n"):
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


def generate_contract_pdf(ct: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    _header(c)

    y = H - 38 * mm
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(W / 2, y, "CONTRATO DE PRESTACIÓN DE SERVICIOS")
    c.setFont("Helvetica", 9); c.setFillColor(GREY)
    y -= 6 * mm
    c.drawCentredString(W / 2, y, "DE COMUNICACIONES ELECTRÓNICAS")
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
    y = _wrap(c, f"De una parte, {ISSUER_LEGAL} (marca comercial {ISSUER_BRAND}), con CIF {ISSUER_CIF} y domicilio en {ISSUER_ADDR}, en adelante EL OPERADOR.",
              LM, y, RM - LM); y -= 2 * mm
    y = _wrap(c, f"Y de otra parte, {ct.get('customerName', '')}, con NIF/CIF {ct.get('fiscalId', '')}, "
              f"domicilio en {ct.get('customerAddress', '')}, email {ct.get('customerEmail', '')} y teléfono {ct.get('customerPhone', '')}, en adelante EL CLIENTE.",
              LM, y, RM - LM); y -= 6 * mm

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
    clauses = [
        ("1. Objeto", "EL OPERADOR prestará a EL CLIENTE los servicios de comunicaciones electrónicas indicados en los datos del servicio, conforme a las condiciones generales publicadas en GOROKY.COM."),
        ("2. Precio y facturación", "EL CLIENTE abonará la cuota mensual indicada, impuestos incluidos, mediante el método de pago acordado. La facturación es mensual y las facturas se emiten y remiten en formato electrónico."),
        ("3. Duración y permanencia", "El contrato tiene duración indefinida. Salvo promoción con compromiso de permanencia expresamente aceptada, EL CLIENTE podrá darse de baja en cualquier momento con un preaviso de dos (2) días hábiles."),
        ("4. Protección de datos", "Los datos de EL CLIENTE serán tratados por EL OPERADOR con la finalidad de gestionar la prestación del servicio y la facturación, conforme al RGPD. EL CLIENTE podrá ejercer sus derechos según la política de privacidad."),
        ("5. Desistimiento", "En contratación a distancia, EL CLIENTE dispone de 14 días naturales para desistir del contrato, salvo que el servicio se haya ejecutado completamente con su consentimiento previo."),
    ]
    for title, body in clauses:
        if y < 45 * mm:
            _footer(c, 1); c.showPage(); _header(c); y = H - 40 * mm
        c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9)
        c.drawString(LM, y, title); y -= 5 * mm
        c.setFillColor(GREY)
        y = _wrap(c, body, LM, y, RM - LM, size=8.5); y -= 3 * mm

    # FIRMAS
    if y < 45 * mm:
        _footer(c, 1); c.showPage(); _header(c); y = H - 45 * mm
    y -= 6 * mm
    c.setStrokeColor(LINE)
    c.line(LM, y, LM + 60 * mm, y)
    c.line(RM - 60 * mm, y, RM, y)
    c.setFillColor(GREY); c.setFont("Helvetica", 8)
    c.drawString(LM, y - 5 * mm, "EL OPERADOR")
    c.drawString(RM - 60 * mm, y - 5 * mm, "EL CLIENTE")
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9)
    c.drawString(LM, y + 3 * mm, ISSUER_BRAND)
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

    _footer(c, 1)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()
