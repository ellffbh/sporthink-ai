from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.routers import auth, campaigns, ad_accounts, metrics, dashboard, recommendations, anomalies, predictions
from app.routers.audit_logs import router as audit_logs_router
from app.routers.features import router as features_router, campaigns_router as features_campaigns_router
from app.routers.simulations import router as simulations_router
from app.core.audit_middleware import AuditLogMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

app = FastAPI(title="AI Dijital Reklam Yönetim Platformu")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://sporthink-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuditLogMiddleware)

app.include_router(auth.router)
app.include_router(campaigns.router)
app.include_router(ad_accounts.router)
app.include_router(metrics.router)
app.include_router(dashboard.router)
app.include_router(recommendations.router)
app.include_router(anomalies.router)
app.include_router(predictions.router)
app.include_router(features_router)
app.include_router(features_campaigns_router)
app.include_router(simulations_router)
app.include_router(audit_logs_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}