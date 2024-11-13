import { Range } from "../diagnostics";

export namespace HIR {
  class Base {
    constructor(public range: Range) {}
  }

  export class VarDecl extends Base {
    constructor(
      public name: string,
      public type: RefToType | null,
      range: Range,
    ) {
      super(range);
    }
    toStringImpl(ident: i32): string {
      return `${"  ".repeat(ident)}VAR DECL ${this.name}:${this.type}`;
    }
  }

  export class GlobalFuncDeclRef extends VarDecl {
    decl: VarDecl | null = null;
    constructor(name: string, range: Range) {
      super(name, null, range);
    }
    toStringImpl(ident: i32): string {
      return `${"  ".repeat(ident)}GLOBAL FUNC REF ${this.name}`;
    }
  }

  export class Block extends Base {
    varDecls: VarDecl[] = [];
    subBlocks: Block[] = [];
    stmts: Stmt[] = [];
    index: i32;
    static _index: i32 = 0;

    constructor(
      public parent: Block | null,
      range: Range,
    ) {
      super(range);
      this.index = Block._index++;
      if (parent) parent.subBlocks.push(this);
    }

    toStringImpl(ident: i32): string {
      const varDeclsStr = this.varDecls.map((d) => "\n" + d.toStringImpl(ident + 2)).join("");
      const stmts = this.stmts.map((s) => "\n" + s.toStringImpl(ident + 2)).join("");
      const scopes = this.subBlocks.map((s) => "\n" + s.toStringImpl(ident + 2)).join("");
      return `${"  ".repeat(ident)}BLOCK ${this.index}:${varDeclsStr}${stmts}${scopes}`;
    }
    toString(): string {
      return this.toStringImpl(0);
    }
    toSimpleString(): string {
      return `BLOCK ${this.index}`;
    }

    static default(): Block {
      return new Block(null, new Range(-1, -1));
    }
  }

  // to resolve a.b
  export class TypeScope {
    typeDecls: TypeDecl[] = [];

    static default(): TypeScope {
      let res = new TypeScope();
      res.typeDecls.push(new TypeDecl("i32", new Range(-1, -1)));
      res.typeDecls.push(new TypeDecl("i64", new Range(-1, -1)));
      res.typeDecls.push(new TypeDecl("f32", new Range(-1, -1)));
      res.typeDecls.push(new TypeDecl("f64", new Range(-1, -1)));
      return res;
    }

    find(name: string): TypeDecl | null {
      for (let decl of this.typeDecls) {
        if (name == decl.name) {
          return decl;
        }
      }
      return null;
    }
  }

  export type Stmt = Assign | Drop | If | While;

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

  export class If extends Base {
    constructor(
      public condition: Expr,
      public trueBlock: Block,
      public falseBlock: Block | null,
      range: Range,
    ) {
      super(range);
    }

    toStringImpl(ident: i32): string {
      return [
        `${"  ".repeat(ident)}IF:`,
        `${"  ".repeat(ident + 1)}COND:${this.condition}`,
        `${"  ".repeat(ident + 1)}THEN: BLOCK ${this.trueBlock.index}`,
        this.falseBlock ? `${"  ".repeat(ident + 1)}ELSE: BLOCK ${this.falseBlock.index}` : null,
      ]
        .filter((v) => v != null)
        .join("\n");
    }
  }

  export class While extends Base {
    constructor(
      public condition: Expr,
      public block: Block,
      range: Range,
    ) {
      super(range);
    }

    toStringImpl(ident: i32): string {
      return [
        `${"  ".repeat(ident)}WHILE:`,
        `${"  ".repeat(ident + 1)}COND:${this.condition}`,
        `${"  ".repeat(ident + 1)}BODY: ${this.block.toSimpleString()}`,
      ].join("\n");
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  export type Expr = RefToDecl | IntegerLiteral | FloatLiteral | BinaryOperator | FuncExpr | Call;

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
    add,
    dec,
    mul,
    div,
    equal,
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
      return `(${BinaryOp[this.op]} ${this.lhs} ${this.rhs})`;
    }
  }

  export class FuncExpr extends Base {
    constructor(
      public body: Block,
      range: Range,
    ) {
      super(range);
    }
    toString(): string {
      return `(FUNC ${this.body.toSimpleString()})`;
    }
  }

  export class Call extends Base {
    constructor(
      public expr: Expr,
      public args: Expr[],
      range: Range,
    ) {
      super(range);
    }

    toString(): string {
      return `(CALL ${this.expr} (${this.args.map((arg) => arg.toString()).join(",")}))`;
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  export class TypeDecl extends Base {
    constructor(
      public name: String,
      range: Range,
    ) {
      super(range);
    }
  }

  export class RefToType extends Base {
    constructor(
      public decl: TypeDecl,
      range: Range,
    ) {
      super(range);
    }

    toString(): String {
      return `type(${this.decl.name})`;
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
}
