#!/usr/bin/env python3
"""
Satya's Education — One-Time Admin Bootstrap Script (Python + Firebase Admin SDK)
Usage:
    python scripts/grant_admin.py <user_email_or_uid>

Sets Firebase Auth Custom Claim `{"admin": True}` and writes `/admins/{uid}` in Cloud Firestore.
Users can NEVER promote themselves from the browser; only this server-side script can bootstrap the first admin.
"""
import os
import sys
import firebase_admin
from firebase_admin import credentials, auth, firestore


def grant_admin(target: str) -> None:
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
    private_key = os.environ.get("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")

    if not project_id or not client_email or not private_key:
        raise RuntimeError(
            "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY environment variables."
        )

    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": project_id,
        "client_email": client_email,
        "private_key": private_key,
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)

    user = auth.get_user_by_email(target) if "@" in target else auth.get_user(target)
    if not user.email_verified:
        raise PermissionError(f"User {user.email} ({user.uid}) does not have a verified email address.")

    existing_claims = user.custom_claims or {}
    existing_claims["admin"] = True
    auth.set_custom_user_claims(user.uid, existing_claims)

    db = firestore.client()
    db.collection("admins").document(user.uid).set({
        "uid": user.uid,
        "email": user.email or "",
        "grantedBy": "python_cli_bootstrap",
        "createdAt": firestore.SERVER_TIMESTAMP,
    })

    print(f"Granted admin custom claim and /admins/{user.uid} document to {user.email}.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/grant_admin.py <user_email_or_uid>")
        sys.exit(1)
    grant_admin(sys.argv[1])
