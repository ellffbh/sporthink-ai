"""add predictions_detail jsonb to model_predictions

Revision ID: d3e7f1a2b9c4
Revises: c8f2a9d14b73
Create Date: 2026-05-06 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd3e7f1a2b9c4'
down_revision: Union[str, Sequence[str], None] = 'c8f2a9d14b73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'model_predictions',
        sa.Column('predictions_detail', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('model_predictions', 'predictions_detail')
