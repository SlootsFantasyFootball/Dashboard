# Data tools

Scripts Claude uses to refresh the Trade Analyzer data built into `index.html`. They read the
live page and write a new one; nothing here runs on the website, and there are no keys or logins.

- `fprows.py` — turns the FantasyPros rest-of-season projections Claude pulled (QB/RB/WR/TE) into
  the rows the Trade Analyzer uses. K/DST and strength-of-schedule rows carry over from the live data.
- `fprefresh.js` — re-applies those rows to the league data already on the site (rosters and records
  unchanged), re-embeds the analyzer, and prints the odds before/after plus a page-error check.

FantasyPros-only refresh:

    python3 tools/fprows.py index.html /tmp/rows.json
    node tools/fprefresh.js index.html /tmp/rows.json /tmp/index_new.html
