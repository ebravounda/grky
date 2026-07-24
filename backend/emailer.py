"""Envío de emails transaccionales con Resend."""
import os
import asyncio
import logging
import resend

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def _sender() -> str:
    return os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


async def send_email(to: str, subject: str, html: str, attachments=None):
    if not is_configured():
        raise RuntimeError("Email no configurado: falta RESEND_API_KEY")
    resend.api_key = os.environ["RESEND_API_KEY"]
    params = {"from": _sender(), "to": [to], "subject": subject, "html": html}
    if attachments:
        params["attachments"] = attachments
    result = await asyncio.to_thread(resend.Emails.send, params)
    return result


GOROKY_LOGO = os.environ.get("GOROKY_LOGO_URL", "") or "https://customer-assets-lxgj4vgw.emergentagent.net/job_likes-telecom-app/artifacts/szvng4fe_IMG_6073.png"


def base_template(title: str, body_html: str) -> str:
    logo = (f"<img src='{GOROKY_LOGO}' alt='GoRoky' style='height:38px' />"
            if GOROKY_LOGO else "<span style='color:#0A6BFF;font-size:22px;font-weight:bold'>GoRoky<span style='color:#FF6A00'>.com</span></span>")
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f3f7;padding:24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:#ffffff;padding:22px 28px;border-bottom:1px solid #eef0f4;text-align:center">
          {logo}
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="font-size:21px;color:#0b1020;margin:0 0 14px">{title}</h1>
          <div style="font-size:14px;color:#374151;line-height:1.6">{body_html}</div>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <p style="font-size:11px;color:#9ca3af;margin:0">TRAMILEX GLOBAL SERVICE SL · CIF B21796925 · Mensaje automático de GoRoky Telecom.</p>
        </td></tr>
      </table>
    </div>"""
