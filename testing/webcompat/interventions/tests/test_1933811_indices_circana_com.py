import pytest
from webdriver.bidi.error import UnknownErrorException

URL = "https://indices.circana.com"
OLD_URL = "https://indices.iriworldwide.com"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_regression_site_is_dead(client):
    try:
        await client.navigate(URL)
        assert False
    except UnknownErrorException:
        assert True


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_regression_old_site_is_dead(client):
    try:
        await client.navigate(OLD_URL)
        assert False
    except UnknownErrorException:
        assert True
