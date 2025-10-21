import pytest

URL = "https://www.gatufotogruppen.se/?page_id=5497"
DESIRED_CSS = ".ultp-block-image"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    assert client.find_css(DESIRED_CSS)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    assert not client.find_css(DESIRED_CSS)
