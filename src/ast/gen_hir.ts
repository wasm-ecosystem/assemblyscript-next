import { DiagnosticCode, DiagnosticEmitter, DiagnosticMessage } from "../diagnostics";
import { HIR } from "../hir/hir";
import { Token } from "../tokenizer";
import * as AST from "./ast";
import { AstVisitor } from "./visitor";

export class HIRGenerator extends AstVisitor {
  constructor(message: DiagnosticMessage[]) {
    super();
    this.emitter = new DiagnosticEmitter(message);
  }
  emitter: DiagnosticEmitter;

  currentScopes: HIR.Scope[] = [];
  get currentScope(): HIR.Scope {
    return this.currentScopes[this.currentScopes.length - 1];
  }

  override visitSource(node: AST.Source): void {
    console.log("visitSource");
    this.currentScopes.push(new HIR.Scope(node.range));
    super.visitSource(node);
    let totalScope: HIR.Scope = this.currentScopes.pop()!;
    console.log(totalScope.toString());
  }

  override visitNamespaceDeclaration(node: AST.NamespaceDeclaration): void {
    this.currentScopes.push(new HIR.Scope(node.range));
    super.visitNamespaceDeclaration(node);
    this.currentScopes.pop();
  }

  override visitFunctionDeclaration(node: AST.FunctionDeclaration): void {
    this.currentScopes.push(new HIR.Scope(node.range));
    super.visitFunctionDeclaration(node);
    this.currentScopes.pop();
  }

  override visitVariableDeclaration(node: AST.VariableDeclaration): void {
    let decl = new HIR.VarDecl(node.name.text, null, node.range);
    this.currentScope.varDecls.push(decl);
    if (node.initializer != null) {
      let initExpr: HIR.Expr | null = this.convertExpression(node.initializer);
      if (initExpr == null) return;
      this.currentScope.stmts.push(new HIR.Assign(new HIR.RefToDecl(decl, node.name.range), initExpr, node.range));
    }
  }

  convertExpression(node: AST.Expression): HIR.Expr | null {
    switch (node.kind) {
      case AST.NodeKind.Literal:
        return this.convertLiteralExpression(<AST.LiteralExpression>node);
      case AST.NodeKind.Identifier:
        return this.convertIdentifierExpression(<AST.IdentifierExpression>node);
      case AST.NodeKind.Binary:
        return this.convertBinaryExpression(<AST.BinaryExpression>node);
      default:
        this.emitter.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    }
    return null;
  }

  convertLiteralExpression(node: AST.LiteralExpression): HIR.Expr | null {
    switch (node.literalKind) {
      case AST.LiteralKind.Integer:
        return new HIR.IntegerLiteral((<AST.IntegerLiteralExpression>node).value, node.range);
      case AST.LiteralKind.Float:
        return new HIR.FloatLiteral((<AST.FloatLiteralExpression>node).value, node.range);
      default:
        this.emitter.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    }
    return null;
  }

  convertIdentifierExpression(node: AST.IdentifierExpression): HIR.Expr | null {
    for (let varDecl of this.currentScope.varDecls) {
      if (node.text == varDecl.name) return new HIR.RefToDecl(varDecl, node.range);
    }
    this.emitter.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    return null;
  }

  convertBinaryExpression(node: AST.BinaryExpression): HIR.Expr | null {
    let lhs = this.convertExpression(node.left);
    let rhs = this.convertExpression(node.right);
    if (lhs == null || rhs == null) return null;
    let op: HIR.BinaryOp;
    switch (node.operator) {
      case Token.Plus:
        op = HIR.BinaryOp.Add;
        break;
      case Token.Minus:
        op = HIR.BinaryOp.Dec;
        break;
      case Token.Asterisk:
        op = HIR.BinaryOp.Mul;
        break;
      case Token.Slash:
        op = HIR.BinaryOp.Div;
        break;
      default:
        this.emitter.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
        return null;
    }
    return new HIR.BinaryOperator(op, lhs, rhs, node.range);
  }
}
