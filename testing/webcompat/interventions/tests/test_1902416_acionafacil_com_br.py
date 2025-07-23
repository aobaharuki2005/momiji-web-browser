import pytest

URL = "https://www.acionafacil.com.br/"

UNSUPPORTED_ALERT = "Google Chrome"
LOGIN_CSS = "#txtCodPrestador"


async def does_alert_show(client):
    alert = await client.await_alert(UNSUPPORTED_ALERT, timeout=3)
    await client.navigate(URL, wait="none")
    assert client.await_css(LOGIN_CSS, is_displayed=True)
    try:
        return await alert
    except Exception:
        return False


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await does_alert_show(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await does_alert_show(client)
