"""PDF-resumen de un adeudo agrupado a un revendedor (formato GoRoky)."""
import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

BLUE = colors.HexColor("#0a63ff")
DARK = colors.HexColor("#0b1020")
GREY = colors.HexColor("#6b7280")
SOFT = colors.HexColor("#f4f6fb")
LINE = colors.HexColor("#e2e6ee")

ISSUER_LEGAL = "TRAMILEX GLOBAL SERVICE SL · CIF B21796925"


def generate_reseller_receipt_pdf(charge: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=16 * mm, title="Recibo revendedor")
    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, textColor=DARK, spaceAfter=2)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, textColor=GREY, spaceAfter=10)
    lbl = ParagraphStyle("lbl", fontName="Helvetica", fontSize=9, textColor=GREY)
    val = ParagraphStyle("val", fontName="Helvetica-Bold", fontSize=10, textColor=DARK)
    cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=9, textColor=DARK)
    cellr = ParagraphStyle("cellr", fontName="Helvetica", fontSize=9, textColor=DARK, alignment=2)
    foot = ParagraphStyle("foot", fontName="Helvetica", fontSize=8, textColor=GREY)

    story = []
    story.append(Paragraph("GoRoky · Recibo de cobro a revendedor", h1))
    created = (charge.get("createdAt") or "")[:19].replace("T", " ")
    story.append(Paragraph(f"{ISSUER_LEGAL} · {created}", sub))

    info = [
        [Paragraph("Revendedor", lbl), Paragraph(charge.get("resellerName") or "", val)],
        [Paragraph("Referencia de adeudo", lbl), Paragraph(charge.get("chargeId", "")[:18], val)],
        [Paragraph("Método", lbl), Paragraph("Domiciliación SEPA", val)],
        [Paragraph("Estado", lbl), Paragraph(
            {"succeeded": "Cobrado", "processing": "En proceso (liquida en unos días)"}.get(charge.get("status"), charge.get("status") or ""), val)],
        [Paragraph("Facturas incluidas", lbl), Paragraph(str(charge.get("invoiceCount") or 0), val)],
    ]
    t = Table(info, colWidths=[55 * mm, 119 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SOFT), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                           ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(t)
    story.append(Spacer(1, 12))

    rows = [[Paragraph("Factura", cellr if False else lbl), Paragraph("Cliente", lbl),
             Paragraph("Periodo", lbl), Paragraph("Importe", ParagraphStyle("hr", parent=lbl, alignment=2))]]
    for it in charge.get("invoices", []):
        rows.append([
            Paragraph(it.get("invoiceNumber", ""), cell),
            Paragraph(f"{it.get('customerName', '')} ({it.get('fiscalId', '')})", cell),
            Paragraph(it.get("period", "") or "", cell),
            Paragraph(f"{float(it.get('total', 0) or 0):.2f} €", cellr),
        ])
    rows.append([Paragraph("", cell), Paragraph("", cell),
                 Paragraph("TOTAL", ParagraphStyle("tt", fontName="Helvetica-Bold", fontSize=10, textColor=DARK, alignment=2)),
                 Paragraph(f"{float(charge.get('total', 0) or 0):.2f} €",
                           ParagraphStyle("tv", fontName="Helvetica-Bold", fontSize=11, textColor=BLUE, alignment=2))])
    tbl = Table(rows, colWidths=[34 * mm, 80 * mm, 32 * mm, 28 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE), ("LINEABOVE", (0, -1), (-1, -1), 0.8, DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 9),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 16))
    story.append(Paragraph("Este documento es un resumen informativo del adeudo SEPA agrupado emitido al revendedor. "
                           "No sustituye a las facturas individuales de cada cliente.", foot))
    doc.build(story)
    return buf.getvalue()


def generate_reseller_clients_pdf(reseller: dict, clients: list) -> bytes:
    """Listado PDF (horizontal) de todos los clientes de un revendedor con sus datos."""
    from reportlab.lib.pagesizes import landscape
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=14 * mm, bottomMargin=12 * mm, title="Clientes del revendedor")
    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, textColor=DARK, spaceAfter=2)
    sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, textColor=GREY, spaceAfter=10)
    cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, textColor=DARK, leading=10)
    hd = ParagraphStyle("hd", fontName="Helvetica-Bold", fontSize=8, textColor=colors.white, leading=10)
    foot = ParagraphStyle("foot", fontName="Helvetica", fontSize=7.5, textColor=GREY)

    story = []
    story.append(Paragraph(f"Clientes del revendedor · {reseller.get('name') or ''}", h1))
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    story.append(Paragraph(f"{ISSUER_LEGAL} · {reseller.get('email') or ''} · {len(clients)} clientes · Generado {now}", sub))

    rows = [[Paragraph("Nombre", hd), Paragraph("Email", hd), Paragraph("Teléfono", hd),
             Paragraph("NIF/NIE", hd), Paragraph("Línea(s)", hd), Paragraph("Fecha de alta", hd)]]
    for c in clients:
        fecha = c.get("created") or ""
        if fecha:
            fecha = str(fecha)[:10]
        rows.append([
            Paragraph(c.get("name") or "", cell),
            Paragraph(c.get("email") or "", cell),
            Paragraph(c.get("phone") or "", cell),
            Paragraph(c.get("fiscalId") or "", cell),
            Paragraph(", ".join(c.get("lines") or []) or "—", cell),
            Paragraph(fecha or "—", cell),
        ])
    tbl = Table(rows, colWidths=[52 * mm, 62 * mm, 32 * mm, 30 * mm, 48 * mm, 26 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 12))
    story.append(Paragraph("Documento interno de GoRoky · listado de clientes asociados al revendedor.", foot))
    doc.build(story)
    return buf.getvalue()
