#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("shipkey")
  .description("Manage developer API keys via 1Password")
  .version("0.1.0");

program.parse();
