"""리포트 결과를 Postgres에 저장. db-writer-consumer와 같은 DB, 별도 테이블(reports)을 쓴다."""

import os

import psycopg2

DB_DSN = os.environ.get(
    "REPORT_DB_DSN",
    "dbname=aiops_db user=aiops password=aiops123 host=localhost port=5432",
)


def save_report(summary: str) -> int:
    with psycopg2.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO reports (summary) VALUES (%s) RETURNING id",
                (summary,),
            )
            report_id = cur.fetchone()[0]
        conn.commit()
    return report_id
