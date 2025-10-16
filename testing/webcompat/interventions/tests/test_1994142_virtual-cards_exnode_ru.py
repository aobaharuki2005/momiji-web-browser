import pytest

URL = "https://virtual-cards.exnode.ru/"

CELLS_CSS = ".flexbe-table__td:nth-child(2)"


async def table_text_properly_rendered(client):
    await client.navigate(URL)
    cells = client.await_css(CELLS_CSS, is_displayed=True, all=True)
    # the text of cells is taller than it is wide when they are rendered incorrectly.
    return client.execute_script(
        """
        const [cells] = arguments;
        for (const cell of arguments[0]) {
          const box = cell.getBoundingClientRect();
          if (box.height > box.width) {
            return false;
          }
        }
        return true;
      """,
        cells,
    )


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await table_text_properly_rendered(client)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await table_text_properly_rendered(client)
