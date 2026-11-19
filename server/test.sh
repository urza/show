#!/usr/bin/env bash
# Checks a running show server from the outside, with curl only.
#
#   SHOW_URL=http://localhost:7469 SHOW_TOKEN=... ./test.sh
#
# The script makes pages, checks the answers of the server, and deletes its pages again.
# It prints one line for each check and ends with code 1 when a check fails.
set -u
: "${SHOW_URL:?Set SHOW_URL, for example http://localhost:7469}"
: "${SHOW_TOKEN:?Set SHOW_TOKEN to the token of the server}"

here=$(cd "$(dirname "$0")" && pwd)
template="$here/../skills/show/assets/template.html"
work=$(mktemp -d)
failed=0
made=()
trap 'for id in "${made[@]}"; do api DELETE "/api/pages/$id" >/dev/null; done; rm -rf "$work"' EXIT

# api METHOD PATH [curl options]: prints the body, and the status code on the last line.
api() { curl -sS -m 20 -w '\n%{http_code}' -X "$1" "$SHOW_URL$2" -H "Authorization: Bearer $SHOW_TOKEN" "${@:3}"; }
# post TEXT: sends TEXT as a new page.
post() { printf '%s' "$1" > "$work/page.html"; api POST /api/pages -H 'Content-Type: text/html' --data-binary "@$work/page.html"; }
id_of() { sed -n 's/.*"id":"\([^"]*\)".*/\1/p' <<<"$1" | head -1; }

# check NAME OUTPUT PATTERN: the output must contain the pattern (a fixed text).
check() {
  if grep -qF -- "$3" <<<"$2"; then echo "ok    $1"; else echo "FAIL  $1: no \"$3\" in: $(head -c 300 <<<"$2")"; failed=1; fi
}
# refused NAME HTML PATTERN: the server must answer 400 with a sentence that contains the pattern.
refused() {
  local out; out=$(post "$2")
  if [[ $(tail -1 <<<"$out") == 400 ]] && grep -qF -- "$3" <<<"$out"; then echo "ok    refuses: $1"
  else echo "FAIL  refuses: $1: $(head -c 300 <<<"$out")"; failed=1; [[ -n $(id_of "$out") ]] && made+=("$(id_of "$out")"); fi
}

ask() { printf '<fieldset class="ask" data-q="%s"><legend>Q</legend>%s</fieldset>' "$1" "$2"; }
opt() { printf '<label class="opt"><input type="radio" name="%s" value="%s"%s><b>%s</b></label>' "$1" "$2" "${4:-}" "$3"; }
note='<textarea></textarea>'

check "health" "$(curl -sS -m 5 "$SHOW_URL/healthz")" "ok"
check "no token gets 401" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$SHOW_URL/api/pages")" "401"
check "wrong token gets 401" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong' "$SHOW_URL/api/pages")" "401"

# ---- the example page ----
out=$(api POST "/api/pages?days=3" -H 'Content-Type: text/html' --data-binary "@$template")
id=$(id_of "$out"); made+=("$id")
check "the example page is accepted" "$out" "201"
check "the server found the questions" "$out" '"questions":["one-answer","cards","more-answers","text-answer","next"]'
check "the title is read" "$out" '"title":"Catalog of the elements"'
page=$(curl -sS -m 10 -D "$work/headers" "$SHOW_URL/p/$id")
check "the page gets the stylesheet" "$page" '<link rel="stylesheet" href="/kit/page.css?v='
check "the page gets the script" "$page" '<script src="/kit/page.js?v='
check "the policy permits only the server script" "$(cat "$work/headers")" "script-src 'self'"
check "the page is not cached" "$(cat "$work/headers")" "no-store"
check "the stored HTML is what the agent sent" "$(curl -sS -m 10 -H "Authorization: Bearer $SHOW_TOKEN" "$SHOW_URL/api/pages/$id/html" | cmp -s - "$template" && echo same)" "same"
for file in page.css page.js ibm-plex-sans-latin-400-normal.woff2; do
  check "kit file $file" "$(curl -sS -m 10 -o /dev/null -w '%{http_code} %{content_type}' "$SHOW_URL/kit/$file?v=1")" "200"
done
check "the stylesheet names the fonts with a version" "$(curl -sS -m 10 "$SHOW_URL/kit/page.css")" ".woff2?v="

# ---- the answers ----
check "no answers yet" "$(curl -sS -m 5 "$SHOW_URL/p/$id/state")" "{}"
check "the browser saves answers" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/json' -d '{"answered":1,"done":true}' "$SHOW_URL/p/$id/state")" "204"
check "the agent reads the answers" "$(api GET "/api/pages/$id")" '"state":{"answered":1,"done":true}'
check "an array is not a state" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' -X PUT -d '[1]' "$SHOW_URL/p/$id/state")" "400"

# ---- a changed page keeps its answers ----
out=$(api PUT "/api/pages/$id" -H 'Content-Type: text/html' --data-binary '<title>Second</title><p>Changed.</p>')
check "a changed page is accepted" "$out" '"title":"Second"'
check "the answers stay" "$out" '"state":{"answered":1,"done":true}'

# ---- content without the frame of a document ----
out=$(post '<h1>Only a heading</h1><p>And one paragraph.</p>')
frag=$(id_of "$out"); made+=("$frag")
check "a fragment is accepted" "$out" '"title":"Only a heading"'
page=$(curl -sS -m 10 "$SHOW_URL/p/$frag")
check "a fragment gets a document frame" "$page" '<!doctype html>'
check "a fragment gets the reading column" "$page" '<main class="page">'

# ---- pages that the server refuses ----
refused "a script" '<p>x</p><script>alert(1)</script>' "<script>"
refused "an image from another site" '<img src="https://example.com/a.png">' "another site"
refused "a stylesheet from another site" '<link rel="stylesheet" href="//example.com/a.css">' "another site"
refused "a question without data-q" '<fieldset class="ask"><legend>Q</legend><textarea placeholder="x"></textarea></fieldset>' "data-q"
refused "two questions with one id" "$(ask a "$(opt a 1 One)")$(ask a "$(opt a 1 One)")" "Two questions"
refused "an option with a wrong name" "$(ask a "$(opt b 1 One)")" 'Each option of a question needs name'
refused "two options with one value" "$(ask a "$(opt a 1 One)$(opt a 1 Two)")" "two options"
refused "an option without a label" "$(ask a '<input type="radio" name="a" value="1">')" "<b> label"
refused "a selected option" "$(ask a "$(opt a 1 One ' checked')")" "checked"
refused "a text field in a question" "$(ask a '<input type="text">')" "not an option"
refused "a question that nobody can answer" "$(ask a '<p>x</p>')" "cannot answer"
refused "a text question without a placeholder" "$(ask a "$note")" "placeholder"
refused "a fieldset that is not closed" '<fieldset class="ask" data-q="a"><legend>Q</legend>' "complete"
out=$(post "$(ask a "$(opt a 1 One)")"); made+=("$(id_of "$out")")
check "a question without a note field gets a warning" "$out" 'has no <textarea> for a note'

# ---- delete ----
check "delete" "$(api DELETE "/api/pages/$frag" | tail -1)" "204"
check "a deleted page is gone" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$SHOW_URL/p/$frag")" "404"
check "a wrong id is not found" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$SHOW_URL/p/..%2F..%2Fetc")" "404"

[[ $failed == 0 ]] && echo "All checks passed." || echo "Some checks FAILED."
exit $failed
