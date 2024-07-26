import { CommandBuilder } from "yargs";

// A helper function to create CommandBuilder without losing the type
// information about defined keys.
export function createBuilder<T extends CommandBuilder>(input: T) { return input }
