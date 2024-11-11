import { Range } from "../diagnostics";

export namespace HIR {
  class Base {
    constructor(public range: Range) {}
  }

  export class VarType {}

  export class VarDecl extends Base {
    constructor(
      public name: string,
      public type: VarType | null,
      range: Range,
    ) {
      super(range);
    }
    toStringImpl(ident: i32): string {
      return `${"  ".repeat(ident)}VAR DECL: ${this.name}`;
    }
  }

  export class FunctionDecl extends Base {}
  export class FunctionBody extends Base {}

  export class Scope extends Base {
    varDecls: VarDecl[] = [];
    subScopes: Scope[] = [];
    stmts: Stmt[] = [];

    toStringImpl(ident: i32): string {
      const varDeclsStr = this.varDecls.map((d) => "\n" + d.toStringImpl(ident + 2)).join("");
      const stmts = this.stmts.map((s) => "\n" + s.toStringImpl(ident + 2)).join("");
      const scopes = this.subScopes.map((s) => "\n" + s.toStringImpl(ident + 2)).join("");
      return `${"  ".repeat(ident)}SCOPE:${varDeclsStr}${stmts}${scopes}`;
    }
    toString(): string {
      return this.toStringImpl(0);
    }
  }

  export type Stmt = Assign | Drop;

  export class Assign extends Base {
    constructor(
      public assignee: RefToDecl,
      public assigner: Expr,
      range: Range,
    ) {
      super(range);
    }

    toStringImpl(ident: i32): string {
      return `${"  ".repeat(ident)}${this.assignee} <- ${this.assigner}`;
    }
  }
  export class Drop extends Base {
    constructor(
      public expr: Expr,
      range: Range,
    ) {
      super(range);
    }
    toStringImpl(ident: i32): string {
      return `${"  ".repeat(ident)}${this.expr}`;
    }
  }

  export type Expr = RefToDecl | IntegerLiteral | FloatLiteral | BinaryOperator;

  export class IntegerLiteral extends Base {
    constructor(
      public value: i64,
      range: Range,
    ) {
      super(range);
    }
    toString(): string {
      return this.value.toString();
    }
  }

  export class FloatLiteral extends Base {
    constructor(
      public value: f64,
      range: Range,
    ) {
      super(range);
    }
    toString(): string {
      return this.value.toString();
    }
  }

  export class RefToDecl extends Base {
    constructor(
      public decl: VarDecl,
      range: Range,
    ) {
      super(range);
    }
    toString(): string {
      return `ref(${this.decl.name})`;
    }
  }

  export enum BinaryOp {
    Add,
    Dec,
    Mul,
    Div,
  }
  export class BinaryOperator extends Base {
    constructor(
      public op: BinaryOp,
      public lhs: Expr,
      public rhs: Expr,
      range: Range,
    ) {
      super(range);
    }
    toString(): string {
      return `${this.lhs} ${BinaryOp[this.op]} ${this.rhs}`;
    }
  }
}
