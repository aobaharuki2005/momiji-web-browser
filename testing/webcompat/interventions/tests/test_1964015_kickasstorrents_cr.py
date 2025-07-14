import pytest
from webdriver.bidi.error import UnknownErrorException

URL = "https://kickasstorrents.cr"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_regression(client):
    try:
        await client.navigate(URL, wait="none", no_skip=True)
        assert False
    except UnknownErrorException:
        assert True
