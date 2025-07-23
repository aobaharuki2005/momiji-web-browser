import pytest

URL = "https://esampark.wondercement.com/"

UNSUPPORTED_ALERT = "Google Chrome"
LOGIN_CSS = "#UserName"
VPN_TEXT = "502 - Bad Gateway"


async def does_alert_show(client):
    alert = await client.await_alert(UNSUPPORTED_ALERT, timeout=3)
    await client.navigate(URL, wait="none")
    login, vpn = client.await_first_element_of(
        [client.css(LOGIN_CSS), client.text(VPN_TEXT)], is_displayed=True
    )
    if vpn:
        pytest.skip("Region-locked, cannot test. Try using a VPN set to the USA.")
        return False
    assert login
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
