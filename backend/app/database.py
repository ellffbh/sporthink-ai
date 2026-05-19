import sys
import json
sys.stdout.reconfigure(encoding='utf-8')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"options": "-c client_encoding=utf8"},
    json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
