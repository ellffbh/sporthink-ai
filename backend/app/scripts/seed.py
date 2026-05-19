from app.database import SessionLocal
from app.models import User, Role, Permission, UserRole, RolePermission
from app.core.security import hash_password

PERMISSIONS = [
    ("campaign.create",        "Kampanya oluştur",           "campaign",    "create"),
    ("campaign.read",          "Kampanya görüntüle",          "campaign",    "read"),
    ("campaign.update",        "Kampanya güncelle",           "campaign",    "update"),
    ("campaign.delete",        "Kampanya sil",                "campaign",    "delete"),
    ("recommendation.read",    "Öneri görüntüle",             "recommendation", "read"),
    ("recommendation.apply",   "Öneri uygula",                "recommendation", "apply"),
    ("prediction.read",        "Tahmin görüntüle",            "prediction",  "read"),
    ("ad_account.create",      "Reklam hesabı oluştur",       "ad_account",  "create"),
    ("ad_account.read",        "Reklam hesabı görüntüle",     "ad_account",  "read"),
    ("ad_account.update",      "Reklam hesabı güncelle",      "ad_account",  "update"),
    ("ad_account.delete",      "Reklam hesabı sil",           "ad_account",  "delete"),
    ("audit_log.read",         "Denetim kaydı görüntüle",     "audit_log",   "read"),
]

ROLE_PERMISSIONS = {
    "admin":    [p[0] for p in PERMISSIONS],
    "analyst":  ["campaign.create", "campaign.read", "campaign.update", "campaign.delete",
                 "recommendation.read", "recommendation.apply", "prediction.read", "ad_account.read"],
    "viewer":   ["campaign.read", "recommendation.read", "prediction.read"],
}


def seed():
    db = SessionLocal()
    try:
        # Permissions
        perm_map = {}
        for code, desc, resource, action in PERMISSIONS:
            existing = db.query(Permission).filter_by(code=code).first()
            if not existing:
                perm = Permission(code=code, description=desc, resource=resource, action=action)
                db.add(perm)
                db.flush()
                perm_map[code] = perm
            else:
                perm_map[code] = existing
        db.commit()

        # Roles
        role_map = {}
        for role_name in ["admin", "analyst", "viewer"]:
            existing = db.query(Role).filter_by(name=role_name).first()
            if not existing:
                role = Role(name=role_name, description=f"{role_name.capitalize()} rolü")
                db.add(role)
                db.flush()
                role_map[role_name] = role
            else:
                role_map[role_name] = existing
        db.commit()

        # Role - Permission eşleştirme
        for role_name, perm_codes in ROLE_PERMISSIONS.items():
            role = role_map[role_name]
            for code in perm_codes:
                perm = perm_map[code]
                exists = db.query(RolePermission).filter_by(
                    role_id=role.id, permission_id=perm.id
                ).first()
                if not exists:
                    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
        db.commit()

        # Admin kullanıcı
        existing_user = db.query(User).filter_by(email="admin@aiproje.local").first()
        if not existing_user:
            admin = User(
                email="admin@aiproje.local",
                full_name="Platform Admin",
                hashed_password=hash_password("Admin123!"),
                is_active=True,
                is_superuser=True,
            )
            db.add(admin)
            db.flush()
            db.add(UserRole(user_id=admin.id, role_id=role_map["admin"].id))
            db.commit()
            print("Admin kullanıcı oluşturuldu: admin@aiproje.local / Admin123!")
        else:
            print("Admin kullanıcı zaten mevcut, atlandı.")

        print("Seed tamamlandı.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
