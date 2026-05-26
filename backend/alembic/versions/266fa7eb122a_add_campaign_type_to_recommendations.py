"""add campaign_type to recommendations

Revision ID: 266fa7eb122a
Revises: d3e7f1a2b9c4
Create Date: 2026-05-26 22:58:15.765346

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '266fa7eb122a'
down_revision: Union[str, Sequence[str], None] = 'd3e7f1a2b9c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recommendations', sa.Column('campaign_type', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('recommendations', 'campaign_type')
