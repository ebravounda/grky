"""Generación de facturas PDF (formato Goroky) con reportlab."""
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

# Datos del emisor
ISSUER_BRAND = "GOROKY"
ISSUER_LEGAL = "TRAMILEX GLOBAL SERVICE SL"
ISSUER_CIF = "CIF B21796925"
ISSUER_ADDR = "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)"

BLUE = colors.HexColor("#0033ff")
ORANGE = colors.HexColor("#ff7a00")
DARK = colors.HexColor("#0b1020")
GREY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f1f3f7")
LINE = colors.HexColor("#d9dde5")

W, H = A4
LM = 18 * mm  # margen izquierdo
RM = W - 18 * mm  # margen derecho


def _fmt_date(iso):
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return iso[:10]


def _header(c):
    # Logo textual Goroky (azul + naranja) .com
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(BLUE); c.drawString(LM, H - 20 * mm, "Goro")
    wgoro = c.stringWidth("Goro", "Helvetica-Bold", 22)
    c.setFillColor(ORANGE); c.drawString(LM + wgoro, H - 20 * mm, "ky")
    c.setFont("Helvetica", 7); c.setFillColor(GREY)
    c.drawString(LM, H - 24 * mm, ".com")
    # Datos emisor (derecha del logo)
    x = LM + 42 * mm
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 13)
    c.drawString(x, H - 16 * mm, ISSUER_BRAND)
    c.setFont("Helvetica", 8); c.setFillColor(GREY)
    c.drawString(x, H - 20 * mm, ISSUER_LEGAL)
    c.drawString(x, H - 23.5 * mm, ISSUER_CIF)
    c.drawString(x, H - 27 * mm, ISSUER_ADDR)


def _footer(c, page_note=""):
    c.setStrokeColor(LINE); c.line(LM, 20 * mm, RM, 20 * mm)
    c.setFillColor(GREY); c.setFont("Helvetica", 6.5)
    txt = (f"{ISSUER_LEGAL} · {ISSUER_CIF} · {ISSUER_ADDR}. "
           "Inscrita en el Registro Mercantil. Documento generado automáticamente.")
    c.drawString(LM, 16 * mm, txt[:150])
    if page_note:
        c.drawRightString(RM, 16 * mm, page_note)


def generate_invoice_pdf(invoice: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    _header(c)

    # ---- Bloque Factura (derecha) ----
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 15)
    c.drawRightString(RM, H - 40 * mm, f"Factura {invoice.get('invoiceNumber', '')}")
    c.setFont("Helvetica", 9); c.setFillColor(GREY)
    c.drawRightString(RM, H - 45 * mm, f"Emisión: {_fmt_date(invoice.get('date'))}")
    c.drawRightString(RM, H - 49.5 * mm, f"Venc.: {_fmt_date(invoice.get('dueDate'))}")
    if invoice.get("period"):
        c.drawRightString(RM, H - 54 * mm, f"Periodo: {invoice['period']}")

    # ---- FACTURAR A (izquierda) ----
    y = H - 40 * mm
    c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 9)
    c.drawString(LM, y, "FACTURAR A")
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 12)
    c.drawString(LM, y - 6 * mm, invoice.get("customerName", ""))
    c.setFont("Helvetica", 9); c.setFillColor(GREY)
    c.drawString(LM, y - 11 * mm, f"CIF/NIF: {invoice.get('fiscalId', '')}")
    if invoice.get("customerAddress"):
        c.drawString(LM, y - 15.5 * mm, invoice["customerAddress"][:70])
    if invoice.get("customerEmail"):
        c.drawString(LM, y - 20 * mm, invoice["customerEmail"])

    # ---- PAGO Y TOTALES (caja gris derecha) ----
    bx, by, bw, bh = RM - 62 * mm, H - 92 * mm, 62 * mm, 30 * mm
    c.setFillColor(LIGHT); c.roundRect(bx, by, bw, bh, 4, fill=1, stroke=0)
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9)
    c.drawString(bx + 4 * mm, by + bh - 6 * mm, "PAGO Y TOTALES")
    pm = invoice.get("paymentMethod", "NO")
    c.setFont("Helvetica", 8); c.setFillColor(GREY)
    c.drawString(bx + 4 * mm, by + bh - 10.5 * mm, f"Método de pago: {pm}")
    rows = [("Base imponible", invoice.get("subtotal", 0)),
            ("IVA (21%)", invoice.get("tax", 0))]
    ry = by + bh - 15.5 * mm
    c.setFont("Helvetica", 9); c.setFillColor(DARK)
    for label, val in rows:
        c.drawString(bx + 4 * mm, ry, label)
        c.drawRightString(bx + bw - 4 * mm, ry, f"{val:.2f} €")
        ry -= 5 * mm
    c.setStrokeColor(LINE); c.line(bx + 4 * mm, ry + 1.5 * mm, bx + bw - 4 * mm, ry + 1.5 * mm)
    c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 11)
    c.drawString(bx + 4 * mm, ry - 3 * mm, "Total Factura")
    c.drawRightString(bx + bw - 4 * mm, ry - 3 * mm, f"{invoice.get('total', 0):.2f} €")

    # ---- Tabla de conceptos ----
    ty = H - 100 * mm
    c.setFillColor(DARK); c.rect(LM, ty, RM - LM, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 9)
    c.drawString(LM + 3 * mm, ty + 2.5 * mm, "Concepto")
    c.drawString(LM + 80 * mm, ty + 2.5 * mm, "Detalle")
    c.drawRightString(RM - 3 * mm, ty + 2.5 * mm, "Precio (€)")
    c.setFillColor(DARK); c.setFont("Helvetica", 9)
    ry = ty - 7 * mm
    for it in invoice.get("items", []):
        c.drawString(LM + 3 * mm, ry + 1.5 * mm, it.get("description", ""))
        c.setFillColor(GREY); c.drawString(LM + 80 * mm, ry + 1.5 * mm, it.get("detail", "") or "")
        c.setFillColor(DARK); c.drawRightString(RM - 3 * mm, ry + 1.5 * mm, f"{it.get('amount', 0):.2f} €")
        c.setStrokeColor(LINE); c.line(LM, ry, RM, ry)
        ry -= 7 * mm

    # ---- Desglose de consumo por línea ----
    consumption = [cn for cn in invoice.get("consumption", []) if cn]
    if consumption:
        ry -= 6 * mm
        c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 10)
        c.drawString(LM, ry, "DETALLE DE CONSUMO POR LÍNEA")
        ry -= 7 * mm
        for cn in consumption:
            if ry < 60 * mm:  # salto de página
                _footer(c); c.showPage(); _header(c); ry = H - 45 * mm
            # cabecera de línea
            c.setFillColor(LIGHT); c.rect(LM, ry - 1 * mm, RM - LM, 7 * mm, fill=1, stroke=0)
            c.setFillColor(DARK); c.setFont("Helvetica-Bold", 9)
            c.drawString(LM + 3 * mm, ry + 1 * mm, f"Línea {cn.get('lineNumber', '')}")
            c.setFont("Helvetica", 8); c.setFillColor(GREY)
            c.drawRightString(RM - 3 * mm, ry + 1 * mm,
                              f"Min. nacionales: {cn.get('nationalMinutes', 0)}   ·   SMS: {cn.get('sms', 0)}   ·   Datos: {cn.get('dataGB', 0)} GB")
            ry -= 8 * mm
            calls = cn.get("calls", [])
            if calls:
                c.setFillColor(GREY); c.setFont("Helvetica-Bold", 7.5)
                c.drawString(LM + 3 * mm, ry, "Nº LLAMADO")
                c.drawString(LM + 55 * mm, ry, "FECHA")
                c.drawRightString(RM - 3 * mm, ry, "DURACIÓN")
                ry -= 4.5 * mm
                c.setFont("Helvetica", 8); c.setFillColor(DARK)
                for call in calls[:20]:
                    if ry < 40 * mm:
                        _footer(c); c.showPage(); _header(c); ry = H - 45 * mm
                        c.setFont("Helvetica", 8); c.setFillColor(DARK)
                    dur = call.get("duration", 0)
                    mm_s = f"{dur // 60}m {dur % 60}s"
                    c.drawString(LM + 3 * mm, ry, str(call.get("number") or "—"))
                    c.setFillColor(GREY); c.drawString(LM + 55 * mm, ry, _fmt_date(call.get("date")))
                    c.setFillColor(DARK); c.drawRightString(RM - 3 * mm, ry, mm_s)
                    ry -= 4.2 * mm
            else:
                c.setFillColor(GREY); c.setFont("Helvetica-Oblique", 8)
                c.drawString(LM + 3 * mm, ry, "Sin llamadas registradas en el periodo.")
                ry -= 5 * mm
            ry -= 4 * mm

    _footer(c, "Página 1")
    c.showPage()

    # ---- Página 2: información legal ----
    _header(c)
    ly = H - 42 * mm
    c.setFillColor(DARK); c.setFont("Helvetica-Bold", 12)
    c.drawString(LM, ly, "Información legal")
    ly -= 8 * mm

    sections = [
        ("Aviso legal",
         "Los servicios facturados son comercializados por GOROKY (TRAMILEX GLOBAL SERVICE SL) por cuenta de "
         "los operadores mayoristas correspondientes (Likes Telecom, XFERA MÓVILES S.A.U. y MEDIOS AUDIOVISUALES "
         "MASMEDIA SL). El operador de red o prestador del servicio depende del tipo de servicio contratado "
         "(móvil/fibra, TV OTT u otros)."),
        ("Datos de carácter personal",
         "El titular puede ejercer sus derechos de acceso, rectificación, cancelación y oposición sobre sus datos "
         "personales dirigiéndose a GOROKY. La política de privacidad completa está disponible en GOROKY.COM."),
        ("Reclamaciones",
         "Podrá presentar reclamaciones en el plazo de un mes desde el hecho que las motive, obteniendo un número "
         "de referencia. En caso de disconformidad podrá acudir a la Secretaría de Estado de Telecomunicaciones o a "
         "las Juntas Arbitrales de Consumo."),
        ("Impago",
         "El impago de los servicios podrá conllevar la suspensión temporal, la interrupción definitiva del servicio, "
         "la resolución del contrato y la reclamación de la deuda pendiente conforme a la normativa vigente."),
    ]
    for title, body in sections:
        c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 9.5)
        c.drawString(LM, ly, title)
        ly -= 5 * mm
        c.setFillColor(GREY); c.setFont("Helvetica", 8.5)
        ly = _wrap(c, body, LM, ly, RM - LM, 4.5 * mm)
        ly -= 4 * mm

    _footer(c, "Página 2")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


def _wrap(c, text, x, y, max_w, lh):
    words = text.split()
    line = ""
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, "Helvetica", 8.5) > max_w:
            c.drawString(x, y, line)
            y -= lh
            line = w
        else:
            line = test
    if line:
        c.drawString(x, y, line)
        y -= lh
    return y
