"""Generación de facturas PDF con reportlab."""
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

BRAND = "Goroky Telecom"
PRIMARY = colors.HexColor("#0033ff")
DARK = colors.HexColor("#0b1020")
GREY = colors.HexColor("#6b7280")


def generate_invoice_pdf(invoice: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4

    # Cabecera
    c.setFillColor(PRIMARY)
    c.rect(0, h - 40 * mm, w, 40 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, h - 22 * mm, BRAND)
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, h - 30 * mm, "Operador de telecomunicaciones")
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(w - 20 * mm, h - 20 * mm, "FACTURA")
    c.setFont("Helvetica", 10)
    c.drawRightString(w - 20 * mm, h - 27 * mm, f"Nº {invoice['invoiceNumber']}")
    c.drawRightString(w - 20 * mm, h - 33 * mm, f"Fecha: {invoice['date'][:10]}")

    # Datos cliente
    y = h - 55 * mm
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "FACTURAR A")
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.black)
    c.drawString(20 * mm, y - 6 * mm, invoice.get("customerName", ""))
    c.drawString(20 * mm, y - 11 * mm, f"NIF/NIE: {invoice.get('fiscalId', '')}")
    if invoice.get("customerEmail"):
        c.drawString(20 * mm, y - 16 * mm, invoice["customerEmail"])

    # Tabla de conceptos
    ty = y - 32 * mm
    c.setFillColor(DARK)
    c.rect(20 * mm, ty, w - 40 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(23 * mm, ty + 2.5 * mm, "Concepto")
    c.drawRightString(w - 55 * mm, ty + 2.5 * mm, "Cant.")
    c.drawRightString(w - 23 * mm, ty + 2.5 * mm, "Importe")

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    ry = ty - 8 * mm
    for item in invoice.get("items", []):
        c.drawString(23 * mm, ry + 2 * mm, item["description"])
        c.drawRightString(w - 55 * mm, ry + 2 * mm, str(item.get("quantity", 1)))
        c.drawRightString(w - 23 * mm, ry + 2 * mm, f"{item['amount']:.2f} €")
        c.setStrokeColor(colors.HexColor("#e5e7eb"))
        c.line(20 * mm, ry, w - 20 * mm, ry)
        ry -= 8 * mm

    # Totales
    ry -= 4 * mm
    c.setFont("Helvetica", 10)
    c.drawRightString(w - 55 * mm, ry, "Base imponible:")
    c.drawRightString(w - 23 * mm, ry, f"{invoice['subtotal']:.2f} €")
    ry -= 6 * mm
    c.drawRightString(w - 55 * mm, ry, "IVA (21%):")
    c.drawRightString(w - 23 * mm, ry, f"{invoice['tax']:.2f} €")
    ry -= 9 * mm
    c.setFillColor(PRIMARY)
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(w - 55 * mm, ry, "TOTAL:")
    c.drawRightString(w - 23 * mm, ry, f"{invoice['total']:.2f} €")

    # Estado
    ry -= 12 * mm
    status = invoice.get("status", "pending")
    label = {"paid": "PAGADA", "pending": "PENDIENTE DE PAGO", "failed": "FALLIDA"}.get(status, status.upper())
    col = {"paid": colors.HexColor("#16a34a"), "pending": colors.HexColor("#d97706"),
           "failed": colors.HexColor("#dc2626")}.get(status, GREY)
    c.setFillColor(col)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, ry, f"Estado: {label}")

    # Pie
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8)
    c.drawString(20 * mm, 15 * mm, f"{BRAND} · Factura generada automáticamente el {datetime.now().strftime('%d/%m/%Y %H:%M')}")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()
