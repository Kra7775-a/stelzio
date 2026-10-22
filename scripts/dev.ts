const server = Bun.spawn(["bun", "--watch", "src/server/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
});

const client = Bun.spawn(["bunx", "vite"], {
  stdio: ["inherit", "inherit", "inherit"],
});

const shutdown = () => {
  server.kill();
  client.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.all([server.exited, client.exited]);

export {};
