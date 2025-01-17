/**
 * @fileoverview A potential minimalistic shadow stack. Currently not used.
 *
 * Instruments a module's exports to track when the execution stack is fully
 * unwound, and injects a call to `__autocollect` to be invoked when it is.
 * Accounts for the currently in-flight managed return value from Wasm to the
 * host by pushing it to a mini stack, essentially a stack of only one value,
 * while `__autocollect` is executing.
 *
 * @license Apache-2.0
 */

import { Pass } from "./pass";

import { BinaryOp, expandType, ExportRef, ExpressionRef, ExternalKind, Index, Module, TypeRef, UnaryOp } from "../module";

import {
  _BinaryenAddFunctionExport,
  _BinaryenExportGetKind,
  _BinaryenExportGetName,
  _BinaryenExportGetValue,
  _BinaryenFunctionGetName,
  _BinaryenFunctionGetNumLocals,
  _BinaryenFunctionGetParams,
  _BinaryenFunctionGetResults,
  _BinaryenGetExportByIndex,
  _BinaryenGetFunction,
  _BinaryenGetNumExports,
  _BinaryenRemoveExport,
} from "../glue/binaryen";

import { Program } from "../program";

const MINISTACK = "~lib/rt/__ministack";
const STACK_DEPTH = "~stack_depth";
const AUTOCOLLECT = "__autocollect";

/** Instruments a module with a minimalistic shadow stack for precise GC. */
export class MiniStack extends Pass {
  /** Compiler reference. */
  program: Program;
  /** Exported functions returning managed values. */
  managedReturns: Set<string> = new Set();

  constructor(module: Module, program: Program) {
    super(module);
    this.program = program;
  }

  /** Notes the presence of an exported function with a managed return value. */
  noteManagedReturn(exportName: string): void {
    this.managedReturns.add(exportName);
  }

  /** Instruments a function export to also maintain stack depth. */
  instrumentFunctionExport(ref: ExportRef): void {
    assert(_BinaryenExportGetKind(ref) == ExternalKind.Function);
    let module = this.module;
    let internalNameRef = _BinaryenExportGetValue(ref);
    let externalNameRef = _BinaryenExportGetName(ref);
    let functionRef = _BinaryenGetFunction(module.ref, internalNameRef);
    let originalName = module.readStringCached(_BinaryenFunctionGetName(functionRef))!;

    let wrapperName = "export:" + originalName;
    if (!module.hasFunction(wrapperName)) {
      let params = _BinaryenFunctionGetParams(functionRef);
      let results = _BinaryenFunctionGetResults(functionRef);
      let numLocals = _BinaryenFunctionGetNumLocals(functionRef);
      let vars = new Array<TypeRef>();

      // Prepare a call to the original function
      let paramTypes = expandType(params);
      let numParams = paramTypes.length;
      let operands = new Array<ExpressionRef>(numParams);
      for (let i = 0; i < numParams; ++i) {
        operands[i] = module.local_get(i, paramTypes[i]);
      }
      let call = module.call(originalName, operands, results);

      // Create a wrapper function also maintaining stack depth
      let stmts = new Array<ExpressionRef>();
      if (numLocals) {
        stmts.push(
          module.global_set(
            STACK_DEPTH,
            module.binary(
              BinaryOp.AddI32,
              module.global_get(STACK_DEPTH, TypeRef.I32),
              module.i32(1), // only need to know > 0
            ),
          ),
        );
      }
      if (results == TypeRef.None) {
        stmts.push(call);
      } else {
        vars.push(results);
        stmts.push(
          module.local_set(numParams, call, false), // no shadow stack here
        );
      }
      if (numLocals) {
        stmts.push(
          module.global_set(
            STACK_DEPTH,
            module.binary(
              BinaryOp.SubI32,
              module.global_get(STACK_DEPTH, TypeRef.I32),
              module.i32(1), // only need to know > 0
            ),
          ),
        );
      }
      let exportName = module.readStringCached(externalNameRef)!;
      stmts.push(module.global_set(MINISTACK, this.managedReturns.has(exportName) ? module.local_get(numParams, results) : module.i32(0)));
      stmts.push(module.if(module.unary(UnaryOp.EqzI32, module.global_get(STACK_DEPTH, TypeRef.I32)), module.call(AUTOCOLLECT, null, TypeRef.None)));
      if (results != TypeRef.None) {
        stmts.push(module.local_get(numParams, results));
      }
      module.addFunction(wrapperName, params, results, vars, module.block(null, stmts, results));
    }

    // Replace the original export with the wrapped one
    _BinaryenRemoveExport(module.ref, externalNameRef);
    _BinaryenAddFunctionExport(module.ref, module.allocStringCached(wrapperName), externalNameRef);
  }

  /** Runs the pass. Returns `true` if the mini stack has been added. */
  run(): bool {
    let module = this.module;
    let moduleRef = module.ref;
    let numExports = _BinaryenGetNumExports(moduleRef);
    if (numExports) {
      let functionExportRefs = new Array<ExportRef>();
      // We are going to modify the list of exports, so do this in two steps
      for (let i: Index = 0; i < numExports; ++i) {
        let exportRef = _BinaryenGetExportByIndex(moduleRef, i);
        if (_BinaryenExportGetKind(exportRef) == ExternalKind.Function) {
          functionExportRefs.push(exportRef);
        }
      }
      let numFunctionExports = functionExportRefs.length;
      if (numFunctionExports) {
        for (let i = 0; i < numFunctionExports; ++i) {
          this.instrumentFunctionExport(functionExportRefs[i]);
        }
        module.addGlobal(STACK_DEPTH, TypeRef.I32, true, module.i32(0));
        return true;
      }
    }
    return false;
  }
}
