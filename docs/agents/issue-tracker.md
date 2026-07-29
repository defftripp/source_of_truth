# Issue tracker: GitHub

Issues and specifications for this repository live in GitHub Issues. Use the
`gh` CLI for all operations and infer the repository from `git remote -v`.

## Conventions

- Create: `gh issue create --title "..." --body "..."`.
- Read: `gh issue view <number> --comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --reason completed`.

Use a heredoc or equivalent safe multiline input for long issue bodies and
comments. When a skill says to publish work to the issue tracker, create or
update a GitHub issue.

## Pull requests as a request surface

PRs as a request surface: no.

GitHub shares one number space across issues and pull requests. Resolve an
ambiguous `#<number>` with `gh pr view <number>` and fall back to
`gh issue view <number>`.

## Blocking edges

GitHub native issue dependencies are canonical when available. The blocker ID
passed to the dependency API is the numeric database ID returned by:

```text
gh api repos/<owner>/<repo>/issues/<number> --jq .id
```

If native dependencies are unavailable, use a `Blocked by: #<number>` line in
the issue body. A ticket is ready only when every declared blocker is closed.

Work blockers-first. Each implementation task owns one ready ticket and uses a
fresh branch/worktree. Record verification evidence in the issue before
closing it.
