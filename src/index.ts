#!/usr/bin/env bun
import { Command } from "commander";
import { scanCommand } from "./commands/scan";
import { pushCommand } from "./commands/push";
import { pullCommand } from "./commands/pull";
import { listCommand } from "./commands/list";
import { syncCommand } from "./commands/sync";
import { setupCommand } from "./commands/setup";

const program = new Command();

program
  .name("shipkey")
  .description("Manage developer API keys via 1Password")
  .version("0.1.0");

program.addCommand(scanCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(listCommand);
program.addCommand(syncCommand);
program.addCommand(setupCommand);

program.parse();
