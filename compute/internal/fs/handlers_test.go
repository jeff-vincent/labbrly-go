package fs

import (
	"testing"
)

func TestParseListOutput(t *testing.T) {
	out := "file1.py\nsubdir/\nfile2.txt\n"
	entries := parseListOutput(out, "/app")

	// dirs should come first
	if entries[0]["type"] != "dir" {
		t.Errorf("first entry should be dir, got %q", entries[0]["type"])
	}
	if entries[0]["name"] != "subdir" {
		t.Errorf("dir name = %q, want %q", entries[0]["name"], "subdir")
	}
	if entries[0]["path"] != "/app/subdir" {
		t.Errorf("dir path = %q, want %q", entries[0]["path"], "/app/subdir")
	}

	// files follow
	fileNames := map[string]bool{}
	for _, e := range entries[1:] {
		fileNames[e["name"]] = true
	}
	for _, want := range []string{"file1.py", "file2.txt"} {
		if !fileNames[want] {
			t.Errorf("expected file %q in entries", want)
		}
	}
}

func TestParseListOutputRootPath(t *testing.T) {
	out := "bin/\nlib/\napp.py\n"
	entries := parseListOutput(out, "/")
	for _, e := range entries {
		if e["type"] == "dir" && e["path"] != "/"+e["name"] {
			t.Errorf("path = %q, want /%s", e["path"], e["name"])
		}
	}
}

func TestParseListOutputDotPath(t *testing.T) {
	out := "main.go\npkg/\n"
	entries := parseListOutput(out, ".")
	for _, e := range entries {
		// Should not start with "./"
		if len(e["path"]) > 1 && e["path"][:2] == "./" {
			t.Errorf("path should not start with ./: %q", e["path"])
		}
	}
}

func TestParseListOutputEmpty(t *testing.T) {
	entries := parseListOutput("", "/app")
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for empty output, got %d", len(entries))
	}
}

func TestSortEntries(t *testing.T) {
	entries := []map[string]string{
		{"name": "zebra.py", "type": "file", "path": "/zebra.py"},
		{"name": "alpha", "type": "dir", "path": "/alpha"},
		{"name": "apple.txt", "type": "file", "path": "/apple.txt"},
		{"name": "beta", "type": "dir", "path": "/beta"},
	}
	sortEntries(entries)

	// dirs first
	if entries[0]["type"] != "dir" || entries[1]["type"] != "dir" {
		t.Error("expected first two entries to be dirs")
	}
	// dirs alpha-sorted
	if entries[0]["name"] != "alpha" || entries[1]["name"] != "beta" {
		t.Errorf("dirs not alpha-sorted: %q %q", entries[0]["name"], entries[1]["name"])
	}
	// files alpha-sorted after dirs
	if entries[2]["name"] != "apple.txt" || entries[3]["name"] != "zebra.py" {
		t.Errorf("files not alpha-sorted: %q %q", entries[2]["name"], entries[3]["name"])
	}
}

func TestShellQuote(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"simple", "'simple'"},
		{"has space", "'has space'"},
		{"it's a test", "'it'\\''s a test'"},
		{"", "''"},
	}
	for _, c := range cases {
		got := shellQuote(c.in)
		if got != c.want {
			t.Errorf("shellQuote(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
