"""Generación de facturas PDF (formato GoRoky) con reportlab / Platypus.

Diseño profesional: cabecera con logo, bloque emisor, FACTURAR A, tabla de
conceptos, totales, desglose de consumo por línea (con barra de datos) y
página de aviso legal. Layout basado en flujo (sin solapamientos)."""
import io
import os
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)
from reportlab.graphics.shapes import Drawing, Rect

# ------------------------- Datos del emisor -------------------------
ISSUER_BRAND = "GOROKY"
ISSUER_LEGAL = "TRAMILEX GLOBAL SERVICE SL"
ISSUER_CIF = "CIF B21796925"
ISSUER_ADDR = "Calle cortina del muelle otr 11, 29015 MALAGA (Málaga)"

# ------------------------- Paleta -------------------------
BLUE = colors.HexColor("#0a63ff")
ORANGE = colors.HexColor("#ff6a00")
DARK = colors.HexColor("#0b1020")
INK = colors.HexColor("#1f2430")
GREY = colors.HexColor("#6b7280")
SOFT = colors.HexColor("#f4f6fb")
TRACK = colors.HexColor("#e5e8ef")
LINE = colors.HexColor("#e2e6ee")

W, H = A4
LM = 18 * mm
RM = 18 * mm
CONTENT_W = W - LM - RM
LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "goroky_logo.png")


def _fmt_date(iso):
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return str(iso)[:10]


def _eur(v):
    try:
        return f"{float(v or 0):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00 €"


def _split_dt(iso):
    """ISO → (dd/mm/aaaa, HH:MM:SS)."""
    if not iso:
        return "-", "-"
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M:%S")
    except Exception:
        return str(iso)[:10], ""


def _cdr_type(t):
    return {"VOICE": "Llamadas", "DATA": "Datos", "SMS": "SMS"}.get((t or "").upper(), t or "-")


def _fmt_bytes(b):
    """bytes → MB o GB (decimal, como facturación telecom)."""
    b = float(b or 0)
    if b <= 0:
        return "0 MB"
    gb = b / 1_000_000_000
    if gb >= 1:
        return f"{gb:.2f} GB".replace(".", ",")
    return f"{b / 1_000_000:.2f} MB".replace(".", ",")


def _fmt_traffic(c):
    """TRÁFICO de un CDR: duración para voz, tamaño para datos, '1 SMS' para SMS."""
    t = (c.get("type") or "").upper()
    if t == "DATA":
        return _fmt_bytes(c.get("bytes", 0))
    if t == "SMS":
        return "1 SMS"
    s = int(c.get("duration", 0) or 0)
    if s >= 60:
        return f"{s // 60}m {s % 60}s"
    return f"{s}s"


# ------------------------- Estilos -------------------------
def _styles():
    return {
        "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=8, textColor=BLUE,
                                 leading=10, spaceAfter=2),
        "name": ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=12, textColor=DARK, leading=15),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=8.5, textColor=GREY, leading=12),
        "meta": ParagraphStyle("meta", fontName="Helvetica", fontSize=9, textColor=INK, leading=13,
                                alignment=TA_RIGHT),
        "metaBig": ParagraphStyle("metaBig", fontName="Helvetica-Bold", fontSize=14, textColor=DARK,
                                  leading=17, alignment=TA_RIGHT),
        "cellH": ParagraphStyle("cellH", fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white,
                                leading=11),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=11),
        "cellB": ParagraphStyle("cellB", fontName="Helvetica-Bold", fontSize=8.5, textColor=INK, leading=11),
        "cellR": ParagraphStyle("cellR", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=11,
                                alignment=TA_RIGHT),
        "cellS": ParagraphStyle("cellS", fontName="Helvetica", fontSize=7.2, textColor=INK, leading=9.5),
        "cellRS": ParagraphStyle("cellRS", fontName="Helvetica", fontSize=7.2, textColor=INK, leading=9.5,
                                 alignment=TA_RIGHT),
        "muted": ParagraphStyle("muted", fontName="Helvetica", fontSize=8, textColor=GREY, leading=11),
        "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=11, textColor=DARK, leading=14,
                            spaceBefore=6, spaceAfter=4),
        "legalH": ParagraphStyle("legalH", fontName="Helvetica-Bold", fontSize=9.5, textColor=BLUE,
                                 leading=12, spaceBefore=6, spaceAfter=2),
        "legal": ParagraphStyle("legal", fontName="Helvetica", fontSize=8, textColor=GREY, leading=11.5,
                                spaceAfter=2),
    }


# ------------------------- Cabecera / pie (en cada página) -------------------------
def _draw_header_footer(canvas, doc):
    canvas.saveState()
    # Logo (con transparencia)
    try:
        img = ImageReader(LOGO_PATH)
        iw, ih = img.getSize()
        lw = 42 * mm
        lh = lw * ih / iw
        canvas.drawImage(img, LM, H - 12 * mm - lh, width=lw, height=lh,
                         mask="auto", preserveAspectRatio=True)
    except Exception:
        canvas.setFont("Helvetica-Bold", 20)
        canvas.setFillColor(ORANGE); canvas.drawString(LM, H - 20 * mm, "Go")
        canvas.setFillColor(BLUE); canvas.drawString(LM + canvas.stringWidth("Go", "Helvetica-Bold", 20), H - 20 * mm, "Roky")

    # Bloque emisor (derecha)
    x = W - RM
    canvas.setFillColor(DARK); canvas.setFont("Helvetica-Bold", 11)
    canvas.drawRightString(x, H - 13 * mm, ISSUER_BRAND)
    canvas.setFillColor(GREY); canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(x, H - 17 * mm, ISSUER_LEGAL)
    canvas.drawRightString(x, H - 20.2 * mm, ISSUER_CIF)
    canvas.drawRightString(x, H - 23.4 * mm, ISSUER_ADDR)

    # Línea separadora bajo cabecera
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.8)
    canvas.line(LM, H - 28 * mm, W - RM, H - 28 * mm)

    # Pie
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.8)
    canvas.line(LM, 16 * mm, W - RM, 16 * mm)
    canvas.setFillColor(GREY); canvas.setFont("Helvetica", 6.5)
    canvas.drawString(LM, 12.5 * mm,
                      f"{ISSUER_LEGAL} · {ISSUER_CIF} · {ISSUER_ADDR}")
    canvas.drawString(LM, 9.8 * mm,
                      "Documento generado automáticamente. Gracias por confiar en GoRoky.")
    canvas.setFillColor(GREY); canvas.setFont("Helvetica", 7)
    canvas.drawRightString(W - RM, 9.8 * mm, f"Página {doc.page}")
    canvas.restoreState()


# ------------------------- Barra de consumo de datos -------------------------
def _data_bar(used, total, width):
    d = Drawing(width, 6 * mm)
    d.add(Rect(0, 0, width, 3 * mm, rx=1.5, ry=1.5, fillColor=TRACK, strokeColor=None))
    if total and total > 0:
        pct = max(0.0, min(1.0, used / total))
        col = ORANGE if pct >= 0.85 else BLUE
        if pct > 0:
            d.add(Rect(0, 0, max(3, width * pct), 3 * mm, rx=1.5, ry=1.5, fillColor=col, strokeColor=None))
    return d


# ------------------------- Tabla helper -------------------------
def _num(v):
    try:
        f = float(v)
        return f"{f:g}"
    except Exception:
        return str(v)


def generate_invoice_pdf(invoice: dict) -> bytes:
    st = _styles()
    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4, leftMargin=LM, rightMargin=RM,
        topMargin=32 * mm, bottomMargin=20 * mm,
        title=f"Factura {invoice.get('invoiceNumber', '')}", author="GoRoky",
    )
    frame = Frame(LM, 20 * mm, CONTENT_W, H - 32 * mm - 20 * mm, id="main",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=_draw_header_footer)])

    story = []

    # ---- FACTURAR A (izq) + Nº factura y fechas (der) ----
    addr = (invoice.get("customerAddress") or "").strip()
    left = []
    left.append(Paragraph("FACTURAR A", st["label"]))
    left.append(Paragraph(invoice.get("customerName", "") or "", st["name"]))
    left.append(Paragraph(f"NIF/CIF: {invoice.get('fiscalId', '')}", st["body"]))
    if addr:
        left.append(Paragraph(addr, st["body"]))
    if invoice.get("customerEmail"):
        left.append(Paragraph(invoice["customerEmail"], st["body"]))
    left_cell = left

    right = [Paragraph(f"Factura {invoice.get('invoiceNumber', '')}", st["metaBig"])]
    right.append(Paragraph(f"Emisión: <b>{_fmt_date(invoice.get('date'))}</b>", st["meta"]))
    right.append(Paragraph(f"Vencimiento: <b>{_fmt_date(invoice.get('dueDate'))}</b>", st["meta"]))
    if invoice.get("period"):
        right.append(Paragraph(f"Periodo: <b>{invoice['period']}</b>", st["meta"]))
    status = (invoice.get("status") or "").lower()
    if status == "paid":
        right.append(Paragraph('<font color="#16a34a"><b>PAGADA</b></font>', st["meta"]))

    head = Table([[left_cell, right]], colWidths=[CONTENT_W * 0.56, CONTENT_W * 0.44])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(head)
    story.append(Spacer(1, 10 * mm))

    # ---- Tabla de conceptos ----
    data = [[Paragraph("Concepto", st["cellH"]), Paragraph("Detalle", st["cellH"]),
             Paragraph("Precio (€)", ParagraphStyle("h2", parent=st["cellH"], alignment=TA_RIGHT))]]
    for it in invoice.get("items", []):
        data.append([
            Paragraph(it.get("description", "") or "", st["cellB"]),
            Paragraph(it.get("detail", "") or "", st["cell"]),
            Paragraph(_eur(it.get("amount", 0)), st["cellR"]),
        ])
    items = Table(data, colWidths=[CONTENT_W * 0.36, CONTENT_W * 0.44, CONTENT_W * 0.20])
    items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 6), ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 1), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
    ]))
    story.append(items)
    story.append(Spacer(1, 6 * mm))

    # ---- Totales (derecha) + método de pago ----
    tot_rows = [
        [Paragraph("Base imponible", st["cell"]), Paragraph(_eur(invoice.get("subtotal", 0)), st["cellR"])],
        [Paragraph("IVA (21%)", st["cell"]), Paragraph(_eur(invoice.get("tax", 0)), st["cellR"])],
        [Paragraph("<b>TOTAL</b>", ParagraphStyle("tl", parent=st["cellB"], textColor=BLUE, fontSize=10.5)),
         Paragraph(_eur(invoice.get("total", 0)),
                   ParagraphStyle("tr", parent=st["cellR"], textColor=BLUE, fontName="Helvetica-Bold", fontSize=10.5))],
    ]
    totals = Table(tot_rows, colWidths=[CONTENT_W * 0.24, CONTENT_W * 0.20])
    totals.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 1), 0.5, LINE),
        ("LINEABOVE", (0, 2), (-1, 2), 1.0, BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))

    pm = invoice.get("paymentMethod", "NO")
    iban = invoice.get("customerIban") or invoice.get("iban") or ""
    pay_lines = [Paragraph("PAGO", st["label"]),
                 Paragraph(f"Método: <b>{pm}</b>", st["body"])]
    if iban:
        pay_lines.append(Paragraph(f"IBAN: <b>{iban}</b>", st["body"]))
    pay_cell = pay_lines

    wrap = Table([[pay_cell, totals]], colWidths=[CONTENT_W * 0.56, CONTENT_W * 0.44])
    wrap.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(wrap)

    # ---- Detalle de consumo por línea (formato idéntico a Likes) ----
    consumption = [cn for cn in (invoice.get("consumption") or []) if cn]
    for cn in consumption:
        cdrs = cn.get("cdrs", []) or []
        data_bytes = float(cn.get("dataBytes", 0) or 0)
        data_cost = float(cn.get("dataCost", 0) or 0)
        story.append(PageBreak())
        story.append(Paragraph(f"Detalle de consumo - Línea {cn.get('lineNumber', '')}", st["h"]))
        story.append(Paragraph(f"Periodo: {cn.get('period', invoice.get('period', ''))}", st["muted"]))
        story.append(Spacer(1, 3 * mm))

        headers = ["FECHA", "HORA", "TIPO", "DESTINO", "TRÁFICO", "NÚMERO DESTINO", "COSTE (€)"]
        rows = [[Paragraph(h, st["cellH"]) for h in headers]]
        for c in cdrs:
            fecha, hora = _split_dt(c.get("date"))
            rows.append([
                Paragraph(fecha, st["cellS"]), Paragraph(hora, st["cellS"]),
                Paragraph(_cdr_type(c.get("type")), st["cellS"]),
                Paragraph(str(c.get("destination") or "-"), st["cellS"]),
                Paragraph(_fmt_traffic(c), st["cellS"]),
                Paragraph(str(c.get("calledNumber") or "-"), st["cellS"]),
                Paragraph(_eur(c.get("price", 0)), st["cellRS"]),
            ])
        if data_bytes > 0:
            rows.append([
                Paragraph("-", st["cellS"]), Paragraph("-", st["cellS"]),
                Paragraph("Datos", st["cellS"]), Paragraph("Datos", st["cellS"]),
                Paragraph(_fmt_bytes(data_bytes), st["cellS"]),
                Paragraph("-", st["cellS"]), Paragraph(_eur(data_cost), st["cellRS"]),
            ])
        if len(rows) == 1:
            story.append(Paragraph("Sin consumo registrado en el periodo.", st["muted"]))
            continue
        ctable = Table(rows, colWidths=[CONTENT_W * x for x in (0.13, 0.11, 0.13, 0.19, 0.14, 0.19, 0.11)], repeatRows=1)
        ctable.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
            ("ALIGN", (6, 0), (6, -1), "RIGHT"),
        ]))
        story.append(ctable)

    # ---- Página de aviso legal ----
    story.append(PageBreak())
    story.append(Paragraph("Aviso Legal", st["h"]))
    story.append(Spacer(1, 2 * mm))
    sections = [
        ("Aviso Legal", [
            "Los Servicios de telecomunicaciones son facturados y comercializados por GOROKY (TRAMILEX GLOBAL "
            "SERVICE SL con CIF B21796925) en nombre y por cuenta de Likes Telecom (EZ EASY TELECOM SL con CIF "
            "B09883612) quien a su vez realiza la gestión de la facturación y cobro en nombre y por cuenta del "
            "operador de red que presta cada servicio según se indica a continuación:",
            "•&nbsp; <b>Servicios de móvil y fibra:</b> El operador de red móvil es XFERA MÓVILES, S.A.U. con CIF "
            "A82528548 y domicilio social Parque Empresarial 'La Finca', Paseo del Club Deportivo, 1, Edif. 8, "
            "28223 - Pozuelo de Alarcón, (Madrid - España).",
            "•&nbsp; <b>Servicio de TV OTT:</b> MEDIOS AUDIOVISUALES MASMEDIA SL con CIF B88644828 como prestatario "
            "del servicio de TV OTT.",
            "•&nbsp; <b>Resto de servicios</b> que no son de telecomunicaciones son comercializados por GOROKY "
            "(TRAMILEX GLOBAL SERVICE SL con CIF B21796925).",
        ]),
        ("Datos de carácter personal", [
            "En cualquier momento puedes ejercitar tus derechos de acceso, rectificación, cancelación y oposición, "
            "mediante petición escrita junto con una fotocopia de tu DNI dirigida a privacy@goroky.com, dirección "
            "Calle Segovia 22, Bajo 4, Madrid, Att. EDUARDO BRAVO. Nuestra política de protección de tus datos se "
            "encuentra recogida en las condiciones generales de contratación y legales de las tarifas, que puedes "
            "consultar en GOROKY.COM.",
        ]),
        ("Reclamaciones", [
            "El abonado deberá dirigirse al departamento o servicio especializado de atención al cliente en el plazo "
            "de un mes desde que se tenga conocimiento del hecho que motive su reclamación. Cuando el abonado presente "
            "la reclamación, el operador está obligado a facilitarle el número de referencia dado a la reclamación del "
            "usuario. Si en el plazo de un mes el usuario no hubiera recibido respuesta satisfactoria del operador, "
            "podrá dirigir su reclamación a las siguientes vías, siguiendo la normativa propia a cada organismo:",
            "•&nbsp; <b>Secretaría de Estado de Telecomunicaciones e Infraestructuras Digitales</b> - Teléfono de "
            "consulta: 901 33 66 99; Página web: http://www.usuariosteleco.es",
            "•&nbsp; <b>Juntas Arbitrales de Consumo</b>, directamente o a través de una Asociación de Consumidores.",
        ]),
        ("Impago", [
            "El presente aviso legal sirve como comunicación fehaciente al abonado en caso de impago de la presente "
            "factura, que conllevará las siguientes actuaciones:",
            "•&nbsp; <b>Impago del Servicio de Telefonía Fija:</b> Transcurrido 1 mes desde el impago se notificará al "
            "abonado por SMS o email la suspensión temporal del servicio si tras el plazo de 48 horas desde el aviso "
            "persiste el impago, cortándose todas las llamadas excepto las dirigidas a servicios de emergencia y "
            "entrantes no facturables. Transcurridos tres meses desde la recepción de la factura y el abonado no "
            "hubiese pagado todavía, se podrá interrumpir definitivamente el servicio, dando de baja la línea y el "
            "contrato aplicando las penalizaciones que correspondan y ejercitará sus derechos para hacer efectivo el "
            "cobro. Antes de la interrupción definitiva, se realizará previo aviso con 48 horas de antelación al "
            "abonado por SMS o email.",
            "•&nbsp; <b>Impago del Resto de Servicios:</b> Se suspenderá temporalmente el servicio una vez esta factura "
            "resulte impagada previa notificación con 48 horas de antelación.",
        ]),
    ]
    for title, paras in sections:
        story.append(Paragraph(title, st["legalH"]))
        for p in paras:
            story.append(Paragraph(p, st["legal"]))
        story.append(Spacer(1, 2 * mm))

    doc.build(story)
    buf.seek(0)
    return buf.read()
