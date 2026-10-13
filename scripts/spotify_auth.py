"""One-time Spotify login. Run on your computer:

    python scripts/spotify_auth.py

It asks for your Spotify app's Client ID and Client Secret, opens Spotify in your
browser so you can approve access, then prints a refresh token to save as the
SPOTIFY_REFRESH_TOKEN secret on GitHub.
"""
import base64
import http.server
import json
import secrets
import urllib.parse
import urllib.request
import webbrowser

REDIRECT = "http://127.0.0.1:8888/callback"
SCOPES = "playlist-modify-private playlist-modify-public"


def main():
    client_id = input("Spotify Client ID: ").strip()
    client_secret = input("Spotify Client Secret: ").strip()
    state = secrets.token_urlsafe(16)
    url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT,
        "scope": SCOPES, "state": state})
    result = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if q.get("state", [""])[0] == state:
                result.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write("<h1>Done - you can close this tab and go back to the terminal.</h1>".encode())

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 8888), Handler)
    print("\nOpening Spotify in your browser. If it doesn't open, paste this link into it:\n" + url + "\n")
    webbrowser.open(url)
    while "code" not in result and "error" not in result:
        server.handle_request()
    if "error" in result:
        raise SystemExit("Spotify said: " + result["error"])

    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=urllib.parse.urlencode({"grant_type": "authorization_code", "code": result["code"],
                                     "redirect_uri": REDIRECT}).encode(),
        headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"})
    tokens = json.loads(urllib.request.urlopen(req).read())
    print("\nYour refresh token (save it as the GitHub secret SPOTIFY_REFRESH_TOKEN):\n")
    print(tokens["refresh_token"])


if __name__ == "__main__":
    main()
