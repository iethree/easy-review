import { expect, test } from "bun:test";
import { imageSource, isGitHubImage } from "./githubImage.ts";

test("GitHub's attachments and repository files go through the server", () => {
  for (const url of [
    "https://github.com/user-attachments/assets/dab82792-ed8c-43d5-ba5f-ddeeda8b9469",
    "https://github.com/metabase/ci-conductor/assets/55151443/0a1b2c3d",
    "https://github.com/acme/app/blob/main/docs/shot.png?raw=true",
    "https://github.com/acme/app/raw/main/docs/shot.png",
    "https://raw.githubusercontent.com/acme/app/main/shot.png",
    "https://user-images.githubusercontent.com/1/abc.png",
    "https://private-user-images.githubusercontent.com/1/abc.png?jwt=x",
  ]) {
    expect(isGitHubImage(url)).toBe(true);
  }
  expect(imageSource("https://github.com/user-attachments/assets/abc")).toBe(
    "/api/image?url=https%3A%2F%2Fgithub.com%2Fuser-attachments%2Fassets%2Fabc",
  );
});

test("anything else loads as it is, and nothing odd is fetched with your token", () => {
  for (const url of [
    "https://img.shields.io/badge/x-y-green",
    "https://camo.githubusercontent.com/abc",
    "https://avatars.githubusercontent.com/u/1",
    "https://github.com/acme/app/pull/1",
    "https://github.com/settings/tokens",
    "http://github.com/user-attachments/assets/abc",
    "https://evil@github.com/user-attachments/assets/abc",
    "https://github.com:8443/user-attachments/assets/abc",
    "https://github.com.evil.com/user-attachments/assets/abc",
    "/relative.png",
    "not a url",
  ]) {
    expect(isGitHubImage(url)).toBe(false);
  }
  expect(imageSource("https://img.shields.io/badge/x")).toBe("https://img.shields.io/badge/x");
});
