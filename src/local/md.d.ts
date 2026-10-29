/** Bun's bundler reads these as text (`with { type: "text" }`); TypeScript needs to be told they exist. */
declare module "*.md" {
  const text: string;
  export default text;
}
