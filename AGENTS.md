# show: rules for agents that change this project

Read `README.md` first. It explains how the parts work together.

- **The agent that uses the skill needs only `curl`.** Do not add a step that needs Node.js, npm
  or another tool on the side of the agent. The owner removed the Node.js build on purpose.
- **The server follows the rules of the other ASP.NET projects of the owner:** one flat project,
  Native AOT, no NuGet package, `web/` compiled into the binary, secrets only in the gitignored
  `.env`. `docker build server` must give no trim warning and no AOT warning.
- **The server adds the look when a browser asks for a page** (`PageHtml.Render`), and not when the
  agent sends the page. The stored file stays what the agent wrote, and a change in `web/` reaches
  each page.
- **A page has no script of its own.** The content security policy in `Program.cs` permits only
  the script of the server. Do not make the policy wider, and do not add a way for an agent to
  send a script. A page is static HTML and CSS.
- **Two files read the markup of a question, and they must agree:** `server/PageHtml.cs` (the
  check at upload) and `server/web/page.js` (the answers in the browser). When you permit new
  markup in a question, change both, and add a check to `server/test.sh`.
- **The server does not read the answers.** `web/page.js` makes the JSON of the answers, and the
  server stores it as bytes. The structure of that JSON is in `README.md` and in `SKILL.md`. Agents
  depend on it, so do not rename a field.
- **`SKILL.md` separates the contract from the guidance.** The owner wants the skill open to the
  judgement of the agent. Put a rule into "The contract" only when the page breaks without it.
  Write all other content as guidance with its reason, not as an order.
- **`skills/show/assets/template.html` is the catalog of the elements.** When you add an element
  to `server/web/page.css`, add an example to the template and one row to the table in `SKILL.md`.
  The template has no topic: the text of each example says what the element is for. Do not put an
  invented project into it. `server/test.sh` sends the template, so it knows its title and the ids
  of its questions.
- **The tabs are in two places:** `server/web/` and `templates/doc-template.html` each have their
  own copy of the styles and the script of `.tabs`. Change both.
- **Plain words.** Write `SKILL.md`, the template, the error sentences of the server and the texts
  of the status bar in short, complete sentences in the active voice. An error sentence says what
  to change.
- **`templates/doc-template.html` is one complete file, and it is its own source.** It has no
  build. Change its styles and its script inside the file. Do not read or print its end: the lines
  below the mark "END OF THE CONTENT" are 200 KB of font data. It started as a copy of the look in
  `server/web/page.css`, but the two are independent. A change of the look in one does not reach
  the other, so decide each time if both need it. Its example content is a catalog of the elements
  without a subject: the text of each example says what the element is for. Keep it that way, and
  add an example when you add an element.
- Run `bash server/test.sh` against a new build before each commit. It does not open a browser,
  so examine a change of `web/page.js` or `web/page.css` in a browser too.
- `upstream` (https://github.com/urza/show) is the stable repository. `origin`
  (https://github.com/d3mnjx/show) is the fork where the work happens. Push a branch to `origin`
  and open the pull request on `urza/show`:
  `gh pr create --repo urza/show --head d3mnjx:<branch>`.
