import { useState } from "react";
import JSZip from "jszip";
import "./App.css";

function normalizeUsername(value) {
  if (typeof value !== "string") return "";

  let username = value.trim();

  if (!username) return "";

  username = username.replace(/^@/, "");

  try {
    if (
      username.startsWith("http://") ||
      username.startsWith("https://")
    ) {
      const url = new URL(username);

      if (
        url.hostname === "instagram.com" ||
        url.hostname === "www.instagram.com"
      ) {
        username = url.pathname.split("/").filter(Boolean)[0] || "";
      }
    }
  } catch {
    // Keep the original username if URL parsing fails.
  }

  username = username.trim().replace(/^@/, "");

  if (
    !username ||
    username.includes("/") ||
    username.includes(" ") ||
    username.includes("?")
  ) {
    return "";
  }

  return username;
}

function extractUsernames(data) {
  const usernames = [];

  function add(value) {
    const username = normalizeUsername(value);

    if (username) {
      usernames.push(username);
    }
  }

  function walk(value) {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const stringList = value.string_list_data;

    if (Array.isArray(stringList)) {
      for (const item of stringList) {
        if (!item || typeof item !== "object") continue;

        if (item.value) {
          add(item.value);
        } else if (item.href) {
          add(item.href);
        }
      }

      // Instagram following exports may store the username in title.
      if (value.title) {
        add(value.title);
      }

      return;
    }

    // Support exports where relationship entries contain title only.
    if (value.title && typeof value.title === "string") {
      add(value.title);
    }

    for (const [key, child] of Object.entries(value)) {
      if (key !== "title") {
        walk(child);
      }
    }
  }

  walk(data);

  return [...new Set(usernames)];
}

function isFollowerFile(path) {
  const filename = path.split("/").pop();

  return /^followers(_\d+)?\.json$/i.test(filename);
}

function isFollowingFile(path) {
  const filename = path.split("/").pop();

  return /^following(_\d+)?\.json$/i.test(filename);
}

export default function App() {
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [notFollowingBack, setNotFollowingBack] = useState([]);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  async function handleUpload(file) {
    if (!file) return;

    setLoading(true);
    setMessage("");
    setReady(false);

    setFollowers([]);
    setFollowing([]);
    setNotFollowingBack([]);
    setSearch("");

    try {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        throw new Error("Please select an Instagram ZIP file.");
      }

      const zip = await JSZip.loadAsync(file);

      const jsonFiles = Object.values(zip.files).filter(
        (entry) =>
          !entry.dir &&
          entry.name.toLowerCase().endsWith(".json")
      );

      let followerList = [];
      let followingList = [];

      let followerFilesFound = 0;
      let followingFilesFound = 0;

      for (const entry of jsonFiles) {
        const path = entry.name.toLowerCase();

        if (!isFollowerFile(path) && !isFollowingFile(path)) {
          continue;
        }

        let data;

        try {
          const content = await entry.async("text");
          data = JSON.parse(content);
        } catch {
          throw new Error(
            `Unable to parse JSON file: ${entry.name}`
          );
        }

        if (isFollowerFile(path)) {
          followerFilesFound++;

          const names = extractUsernames(data);
          followerList.push(...names);
        }

        if (isFollowingFile(path)) {
          followingFilesFound++;

          let relationships = data;

          if (
            data &&
            !Array.isArray(data) &&
            Array.isArray(data.relationships_following)
          ) {
            relationships = data.relationships_following;
          }

          const names = extractUsernames(relationships);
          followingList.push(...names);
        }
      }

      followerList = [
        ...new Map(
          followerList.map((name) => [
            name.toLowerCase(),
            name
          ])
        ).values()
      ];

      followingList = [
        ...new Map(
          followingList.map((name) => [
            name.toLowerCase(),
            name
          ])
        ).values()
      ];

      if (followerFilesFound === 0) {
        throw new Error(
          "Followers JSON files were not found. Please download your Instagram information in JSON format and upload the ZIP file."
        );
      }

      if (followingFilesFound === 0) {
        throw new Error(
          "Following JSON file was not found. Please make sure your Instagram download includes both Followers and Following information."
        );
      }

      if (
        followerList.length === 0 &&
        followingList.length === 0
      ) {
        throw new Error(
          "No usernames were found. Please check your Instagram JSON export."
        );
      }

      const followerSet = new Set(
        followerList.map((username) => username.toLowerCase())
      );

      const results = followingList.filter(
        (username) => !followerSet.has(username.toLowerCase())
      );

      setFollowers(followerList);
      setFollowing(followingList);
      setNotFollowingBack(results);
      setReady(true);

      setMessage(
        `Analysis complete! Found ${followerList.length} followers, ${followingList.length} following, and ${results.length} accounts that don't follow you back.`
      );
    } catch (error) {
      setMessage(
        error.message || "Unable to read the ZIP file."
      );
    } finally {
      setLoading(false);
    }
  }

  const visibleUsers = notFollowingBack.filter((username) =>
    username.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <main className={dark ? "app dark" : "app light"}>
      <header className="topbar">
        <a href="#home" className="brand">
          <span className="brand-icon">↗</span>
          <span>
            FollowBack<span className="brand-accent"> Checker</span>
          </span>
        </a>

        <button
          className="theme-button"
          onClick={() => setDark((previous) => !previous)}
          type="button"
        >
          {dark ? "☀️ Light" : "🌙 Dark"}
        </button>
      </header>

      <section className="hero" id="home">
        <div className="badge">🔒 PRIVATE BY DESIGN</div>

        <h1>
          Who doesn't
          <br />
          <span>follow you back?</span>
        </h1>

        <p className="hero-text">
          Find accounts you follow that don't follow you back.
          No Instagram login or password required.
          Your ZIP file is processed in your browser.
        </p>

        <div className="privacy-note">
          <span>🛡️</span>
          <span>Your Instagram data stays on your device</span>
        </div>
      </section>

      <section className="upload-card">
        <div className="upload-icon">📁</div>

        <h2>Upload Your Instagram Data</h2>

        <p>
          Select the ZIP file downloaded from Instagram.
          Your export must include Followers and Following in JSON format.
        </p>

        <label className="upload-button">
          {loading ? "Analyzing ZIP..." : "Choose Instagram ZIP"}
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                handleUpload(file);
              }

              event.target.value = "";
            }}
          />
        </label>

        <div className="file-hint">
          ZIP file only · JSON format required
        </div>

        {message && (
          <div
            className={ready ? "message success" : "message error"}
            role="status"
          >
            {message}
          </div>
        )}
      </section>

      {ready && (
        <>
          <section className="stats">
            <article className="stat-card">
              <span className="stat-icon">👥</span>
              <span className="stat-label">Followers</span>
              <strong>{followers.length}</strong>
            </article>

            <article className="stat-card">
              <span className="stat-icon">➡️</span>
              <span className="stat-label">Following</span>
              <strong>{following.length}</strong>
            </article>

            <article className="stat-card highlight">
              <span className="stat-icon">↩️</span>
              <span className="stat-label">Not Following Back</span>
              <strong>{notFollowingBack.length}</strong>
            </article>
          </section>

          <section className="results-card">
            <div className="results-heading">
              <div>
                <h2>Not Following You Back</h2>
                <p>
                  {visibleUsers.length} of {notFollowingBack.length} accounts
                </p>
              </div>
            </div>

            <input
              className="search-input"
              type="search"
              placeholder="Search username..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {visibleUsers.length === 0 ? (
              <div className="empty">
                <span>{search ? "🔎" : "🎉"}</span>

                <h3>
                  {search
                    ? "No Matching Accounts"
                    : "Everyone Is Following Back!"}
                </h3>

                <p>
                  {search
                    ? "Try searching for another username."
                    : "No accounts were found in your not-following-back list."}
                </p>
              </div>
            ) : (
              <div className="user-list">
                {visibleUsers.map((username) => (
                  <div className="user-row" key={username}>
                    <div className="avatar">
                      {username.charAt(0).toUpperCase()}
                    </div>

                    <div className="user-info">
                      <strong>@{username}</strong>
                      <span>Doesn't follow you back</span>
                    </div>

                    <a
                      className="profile-button"
                      href={`https://www.instagram.com/${encodeURIComponent(username)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Profile ↗
                    </a>
                  </div>
                ))}
              </div>
            )}

            <p className="manual-note">
              Profiles open separately on Instagram. Review each account
              and unfollow manually if you choose.
            </p>
          </section>
        </>
      )}

      <section className="how-section">
        <div className="section-kicker">SIMPLE AND PRIVATE</div>

        <h2>How to Use</h2>

        <div className="steps">
          <article className="step-card">
            <span className="step-number">01</span>
            <h3>Download Your Data</h3>
            <p>
Open Instagram Settings and go to Accounts Center → Your information and permissions → Export your information.
Tap Create export, select your Instagram profile, and select Followers and Following. Select JSON as the format, then create your export.            
</p>
          </article>

          <article className="step-card">
            <span className="step-number">02</span>
            <h3>Upload the ZIP File</h3>
            <p>
              Select the downloaded ZIP file. Keep the ZIP file intact;
              you do not need to extract it first.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">03</span>
            <h3>Check the Results</h3>
            <p>
              Compare your Followers and Following lists, search usernames,
              and open profiles to review accounts manually.
            </p>
          </article>
        </div>
      </section>

      <footer>
        <div className="footer-brand">FollowBack Checker</div>

        <p>
          No Instagram password required. Your ZIP is processed locally
          in your browser.
        </p>

        <p className="footer-small">
          Results reflect the data in your downloaded Instagram export.
          Changes made after the export may not appear.
        </p>
      </footer>
    </main>
  );
}
