/**
 * @module cli
 * @description View CLI 入口。
 */

import { Command } from "@dreamer/console";
import { main as build } from "./cli/build.ts";
import { main as dev } from "./cli/dev.ts";
import { main as init } from "./cli/init.ts";
import { main as start } from "./cli/start.ts";

const program = new Command("view")
  .info("Dreamer View CLI");

program
  .command("init", "Initialize a new View project")
  .option({ name: "-d, --dir <dir>", description: "Target directory" })
  .option({ name: "--beta", description: "Use beta version" })
  .action((_args, options) => init(options));

program
  .keepAlive()
  .command("dev", "Start development server with HMR")
  .option({ name: "-p, --port <port>", description: "Server port" })
  .option({ name: "-h, --host <host>", description: "Server host" })
  .action((_args, options) => dev(options));

program
  .command("build", "Build the project for production")
  .action((_args, options) => build(options));

program
  .command("start", "Start production server")
  .option({ name: "-p, --port <port>", description: "Server port" })
  .option({ name: "-h, --host <host>", description: "Server host" })
  .action((_args, options) => start(options));

await program.execute();
