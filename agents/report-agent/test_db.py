"""실제 Postgres 없이, psycopg2.connect 자체를 대체해서 INSERT/커밋 흐름만 검증한다."""

from unittest.mock import MagicMock, patch

import db


def test_save_report는_summary를_바인딩_삽입하고_생성된_id를_반환한다():
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = (42,)
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value = mock_conn
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    with patch("db.psycopg2.connect", return_value=mock_conn) as mock_connect:
        report_id = db.save_report("오늘 결제 트래픽은 평소와 비슷했습니다.")

    mock_connect.assert_called_once_with(db.DB_DSN)
    mock_cursor.execute.assert_called_once_with(
        "INSERT INTO reports (summary) VALUES (%s) RETURNING id",
        ("오늘 결제 트래픽은 평소와 비슷했습니다.",),
    )
    mock_conn.commit.assert_called_once()
    assert report_id == 42
