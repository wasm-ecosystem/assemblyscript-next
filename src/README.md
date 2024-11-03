# Compiler

Portable compiler sources that compile to both JavaScript using `tsc` and WebAssembly using `asc`.

## Architecture

![](https://raw.githubusercontent.com/AssemblyScript/assemblyscript/main/media/architecture.svg)

## Usage

```js
import assemblyscript from "assemblyscript";
...
```

## Building

### Building to JavaScript

To build the compiler, run:

```sh
npm run build
```

The rebuild automatically when there are changes, do:

```sh
npm run watch
```
