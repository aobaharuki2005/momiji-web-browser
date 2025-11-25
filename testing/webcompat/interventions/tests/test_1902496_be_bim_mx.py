import pytest

URL = "https://be.bim.mx/nb/index.cfm"

UNBLOCKED_CSS = "#myModal"
BLOCKED_TEXT = "Google Chrome"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(UNBLOCKED_CSS, is_displayed=True)
    assert not client.find_text(BLOCKED_TEXT, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_text(BLOCKED_TEXT, is_displayed=True)
    assert not client.find_css(UNBLOCKED_CSS, is_displayed=True)
