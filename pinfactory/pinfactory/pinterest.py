"""Component 3 — a thin Pinterest API v5 client.

Verified against the current Pinterest v5 docs (see SETUP.md):
  - OAuth 2.0 confidential flow: authorize at www.pinterest.com/oauth/,
    exchange/refresh at api.pinterest.com/v5/oauth/token (HTTP Basic client auth).
  - Boards:  GET/POST /v5/boards
  - Pins:    POST /v5/pins with an inline base64 `media_source` (no separate
             media upload needed for a single image).
  - Analytics: GET /v5/pins/{id}/analytics, GET /v5/user_account/analytics.

Trial-access apps can only create pins in the SANDBOX (owner-only, not public);
publishing public pins needs Standard access. The base URL is configurable
(`PINTEREST_API_BASE`) so you develop against the sandbox and flip to production
after approval.

`dry_run=True` does everything except call the pin-create endpoint.
"""

from __future__ import annotations

import base64
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

TOKEN_URL = "https://api.pinterest.com/v5/oauth/token"
AUTHORIZE_URL = "https://www.pinterest.com/oauth/"
DEFAULT_SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"]


class PinterestError(Exception):
    def __init__(self, message: str, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str = ""
    expires_in: int = 0
    scope: str = ""


class PinterestClient:
    def __init__(self, *, app_id: str = "", app_secret: str = "",
                 access_token: str = "", refresh_token: str = "",
                 api_base: str = "https://api-sandbox.pinterest.com/v5",
                 redirect_uri: str = "", dry_run: bool = False,
                 max_retries: int = 4):
        self.app_id = app_id
        self.app_secret = app_secret
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.api_base = api_base.rstrip("/")
        self.redirect_uri = redirect_uri
        self.dry_run = dry_run
        self.max_retries = max_retries
        self.session = requests.Session()

    # --- OAuth -------------------------------------------------------------
    def authorization_url(self, state: str, scopes: list[str] | None = None) -> str:
        params = {
            "client_id": self.app_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": ",".join(scopes or DEFAULT_SCOPES),
            "state": state,
        }
        return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"

    def _basic_auth(self) -> dict[str, str]:
        raw = f"{self.app_id}:{self.app_secret}".encode()
        return {"Authorization": "Basic " + base64.b64encode(raw).decode()}

    def exchange_code(self, code: str) -> TokenBundle:
        data = {"grant_type": "authorization_code", "code": code,
                "redirect_uri": self.redirect_uri}
        return self._token_request(data)

    def refresh(self) -> TokenBundle:
        if not self.refresh_token:
            raise PinterestError("No refresh token available; re-run `pinfactory auth`.")
        data = {"grant_type": "refresh_token", "refresh_token": self.refresh_token}
        bundle = self._token_request(data)
        # Pinterest may or may not rotate the refresh token; keep the old one if absent.
        if not bundle.refresh_token:
            bundle.refresh_token = self.refresh_token
        return bundle

    def _token_request(self, data: dict[str, str]) -> TokenBundle:
        resp = self.session.post(TOKEN_URL, data=data,
                                 headers={**self._basic_auth(),
                                          "Content-Type": "application/x-www-form-urlencoded"},
                                 timeout=30)
        if resp.status_code != 200:
            raise PinterestError(f"Token request failed: {resp.status_code} {resp.text[:300]}",
                                 status=resp.status_code)
        j = resp.json()
        b = TokenBundle(access_token=j.get("access_token", ""),
                        refresh_token=j.get("refresh_token", ""),
                        expires_in=j.get("expires_in", 0), scope=j.get("scope", ""))
        self.access_token = b.access_token or self.access_token
        if b.refresh_token:
            self.refresh_token = b.refresh_token
        return b

    # --- request wrapper with backoff -------------------------------------
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json"}

    def _request(self, method: str, path: str, *, params=None, json=None) -> Any:
        url = f"{self.api_base}{path}"
        delay = 2.0
        last_exc: PinterestError | None = None
        for attempt in range(self.max_retries + 1):
            try:
                resp = self.session.request(method, url, headers=self._headers(),
                                            params=params, json=json, timeout=30)
            except requests.RequestException as e:
                last_exc = PinterestError(f"Network error: {e}", retryable=True)
                if attempt < self.max_retries:
                    time.sleep(delay); delay *= 2; continue
                raise last_exc
            if resp.status_code == 401 and self.refresh_token and attempt == 0:
                # token expired mid-run — refresh once and retry
                self.refresh()
                continue
            if resp.status_code in (429, 500, 502, 503, 529):
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                last_exc = PinterestError(f"{resp.status_code} {resp.text[:200]}",
                                          status=resp.status_code, retryable=True)
                if attempt < self.max_retries:
                    time.sleep(wait); delay *= 2; continue
                raise last_exc
            if resp.status_code >= 400:
                raise PinterestError(f"{resp.status_code} {resp.text[:300]}",
                                     status=resp.status_code, retryable=False)
            return resp.json() if resp.content else {}
        raise last_exc or PinterestError("request failed")

    # --- boards ------------------------------------------------------------
    def list_boards(self) -> list[dict[str, Any]]:
        items, bookmark = [], None
        while True:
            params = {"page_size": 100}
            if bookmark:
                params["bookmark"] = bookmark
            data = self._request("GET", "/boards", params=params)
            items.extend(data.get("items", []))
            bookmark = data.get("bookmark")
            if not bookmark:
                break
        return items

    def create_board(self, name: str, description: str = "", privacy: str = "PUBLIC") -> dict[str, Any]:
        return self._request("POST", "/boards",
                             json={"name": name, "description": description, "privacy": privacy})

    # --- pins --------------------------------------------------------------
    def create_pin(self, *, board_id: str, image_path: str, title: str = "",
                   description: str = "", link: str = "", alt_text: str = "") -> dict[str, Any]:
        p = Path(image_path)
        media = {"source_type": "image_base64", "content_type": "image/png",
                 "data": base64.b64encode(p.read_bytes()).decode()}
        body: dict[str, Any] = {"board_id": board_id, "media_source": media}
        if title:
            body["title"] = title[:100]
        if description:
            body["description"] = description[:800]
        if link:
            body["link"] = link
        if alt_text:
            body["alt_text"] = alt_text[:500]
        if self.dry_run:
            # Everything except the network call.
            return {"id": f"dryrun-{p.stem[:24]}", "_dry_run": True}
        return self._request("POST", "/pins", json=body)

    def save_pin_to_board(self, pin_id: str, board_id: str) -> dict[str, Any]:
        """Re-save (repin) an existing pin to another board."""
        if self.dry_run:
            return {"id": f"dryrun-resave-{pin_id[:16]}", "_dry_run": True}
        media = {"source_type": "pin_url",
                 "url": f"https://www.pinterest.com/pin/{pin_id}/"}
        return self._request("POST", "/pins", json={"board_id": board_id, "media_source": media})

    # --- analytics ---------------------------------------------------------
    def pin_analytics(self, pin_id: str, start_date: str, end_date: str,
                      metrics: list[str]) -> dict[str, Any]:
        return self._request("GET", f"/pins/{pin_id}/analytics",
                            params={"start_date": start_date, "end_date": end_date,
                                    "metric_types": ",".join(metrics)})

    def user_analytics(self, start_date: str, end_date: str, metrics: list[str]) -> dict[str, Any]:
        return self._request("GET", "/user_account/analytics",
                            params={"start_date": start_date, "end_date": end_date,
                                    "metric_types": ",".join(metrics)})
