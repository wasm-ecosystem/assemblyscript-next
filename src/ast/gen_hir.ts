import { DiagnosticCode, DiagnosticEmitter, DiagnosticMessage, Range } from "../diagnostics";
import { HIR } from "../hir/hir";
import { Token } from "../tokenizer";
import * as AST from "./ast";
import { AstVisitor } from "./visitor";

function isArrayEmpty<T>(v: T[] | null): bool {
  return v == null || v.length == 0;
}

const nativeRange = AST.Source.native.range;

export class FilePreVisitor extends AstVisitor {
  constructor(private fileBlock: HIR.Block) {
    super();
  }
  override visitFunctionDeclaration(node: AST.FunctionDeclaration): void {
    if (this.parent?.kind == AST.NodeKind.Source) {
      let functionDecl = new HIR.GlobalFuncDeclRef(node.name.text, node.name.range);
      this.fileBlock.varDecls.push(functionDecl);
    }
  }
}

export class HIRGenerator extends AstVisitor {
  constructor(message: DiagnosticMessage[]) {
    super();
    this.emitter = new DiagnosticEmitter(message);
    this.currentTypeScopes.push(HIR.TypeScope.default());
  }

  emitter: DiagnosticEmitter;
  error(code: DiagnosticCode, range: Range | null, arg0?: string | null, arg1?: string | null, arg2?: string | null): null {
    this.emitter.error(code, range, arg0, arg1, arg2);
    return null;
  }

  currentBlock: HIR.Block = HIR.Block.default();
  enterBlock(block: HIR.Block) {
    this.currentBlock = block;
  }
  exitBlock() {
    this.currentBlock = this.currentBlock.parent!;
  }

  currentTypeScopes: HIR.TypeScope[] = [];
  get currentTypeScope(): HIR.TypeScope {
    return this.currentTypeScopes[this.currentTypeScopes.length - 1]!;
  }

  tmpVarCounter = 0;
  allocTmpVariable() {
    let decl = new HIR.VarDecl(`__tmp_${this.tmpVarCounter}`, null, nativeRange);
    this.currentBlock.varDecls.push(decl);
    this.tmpVarCounter++;
    return decl;
  }

  override visitSource(node: AST.Source): void {
    let fileBlock = new HIR.Block(this.currentBlock, node.range);
    this.enterBlock(fileBlock);
    new FilePreVisitor(fileBlock).visitNode(node);
    {
      let sourceBlock = new HIR.Block(this.currentBlock, node.range);
      this.enterBlock(sourceBlock);
      super.visitSource(node);
      this.exitBlock();
    }
    console.log(this.currentBlock.toString());
    this.exitBlock();
  }

  override visitFunctionDeclaration(node: AST.FunctionDeclaration): void {
    let functionDecl = new HIR.VarDecl(node.name.text, null, node.name.range);
    this.currentBlock.varDecls.push(functionDecl);
    let functionBlock = new HIR.Block(this.currentBlock, node.range);
    this.currentBlock.stmts.push(new HIR.Assign(new HIR.RefToDecl(functionDecl, node.name.range), new HIR.FuncExpr(functionBlock, node.range), node.range));
    this.enterBlock(functionBlock);
    for (let parameter of node.signature.parameters) {
      if (parameter.parameterKind != AST.ParameterKind.Default) this.error(DiagnosticCode.Not_implemented_0, parameter.range, "convert to HIR");
      if (parameter.initializer) this.error(DiagnosticCode.Not_implemented_0, parameter.initializer.range, "convert to HIR");
      let parameterType: HIR.RefToType | null = null;
      if (parameter.type != null) parameterType = this.convertTypeNode(parameter.type);
      this.currentBlock.varDecls.push(new HIR.VarDecl(parameter.name.text, parameterType, parameter.range));
    }
    this.visitNode(node.body);
    this.exitBlock();
  }

  override visitBlockStatement(node: AST.BlockStatement): void {
    this.enterBlock(new HIR.Block(this.currentBlock, node.range));
    super.visitBlockStatement(node);
    this.exitBlock();
  }

  override visitVariableDeclaration(node: AST.VariableDeclaration): void {
    let type = null;
    if (node.type != null) type = this.convertTypeNode(node.type);
    let decl = new HIR.VarDecl(node.name.text, type, node.range);
    this.currentBlock.varDecls.push(decl);
    if (node.initializer != null) {
      let initExpr: HIR.Expr | null = this.convertExpression(node.initializer);
      if (initExpr == null) return;
      this.currentBlock.stmts.push(new HIR.Assign(new HIR.RefToDecl(decl, node.name.range), initExpr, node.range));
    }
  }

  override visitExpressionStatement(node: AST.ExpressionStatement): void {
    let expr: HIR.Expr | null = this.convertExpression(node.expression);
    if (expr == null) return;
    this.currentBlock.stmts.push(new HIR.Drop(expr, node.range));
  }

  override visitIfStatement(node: AST.IfStatement): void {
    let condExpr: HIR.Expr | null = this.convertExpression(node.condition);
    if (condExpr == null) return;
    let trueBlock = new HIR.Block(this.currentBlock, node.ifTrue.range);
    if (node.ifFalse) {
      let falseBlock = new HIR.Block(this.currentBlock, node.ifFalse.range);

      this.currentBlock.stmts.push(new HIR.If(condExpr, trueBlock, falseBlock, node.range));

      this.enterBlock(trueBlock);
      super.visitNode(node.ifTrue);
      this.exitBlock();

      this.enterBlock(falseBlock);
      super.visitNode(node.ifFalse);
      this.exitBlock();
    } else {
      this.currentBlock.stmts.push(new HIR.If(condExpr, trueBlock, null, node.range));

      this.enterBlock(trueBlock);
      super.visitNode(node.ifTrue);
      this.exitBlock();
    }
  }

  override visitWhileStatement(node: AST.WhileStatement): void {
    let condExpr: HIR.Expr | null = this.convertExpression(node.condition);
    if (condExpr == null) return;
    let block = new HIR.Block(this.currentBlock, node.body.range);
    this.currentBlock.stmts.push(new HIR.While(condExpr, block, node.range));
    this.enterBlock(block);
    super.visitNode(node.body);
    this.exitBlock();
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  convertExpression(node: AST.Expression): HIR.Expr | null {
    switch (node.kind) {
      case AST.NodeKind.Literal:
        return this.convertLiteralExpression(<AST.LiteralExpression>node);
      case AST.NodeKind.Identifier:
        return this.convertIdentifierExpression(<AST.IdentifierExpression>node);
      case AST.NodeKind.Binary:
        return this.convertBinaryExpression(<AST.BinaryExpression>node);
      case AST.NodeKind.Call:
        return this.convertCallExpression(<AST.CallExpression>node);
      case AST.NodeKind.Function:
        return this.convertFunctionExpression(<AST.FunctionExpression>node);
      default:
        return this.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    }
  }

  convertLiteralExpression(node: AST.LiteralExpression): HIR.Expr | null {
    switch (node.literalKind) {
      case AST.LiteralKind.Integer:
        return new HIR.IntegerLiteral((<AST.IntegerLiteralExpression>node).value, node.range);
      case AST.LiteralKind.Float:
        return new HIR.FloatLiteral((<AST.FloatLiteralExpression>node).value, node.range);
      default:
        return this.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    }
  }

  convertIdentifierExpression(node: AST.IdentifierExpression): HIR.Expr | null {
    let currentLookupBlock: HIR.Block | null = this.currentBlock;
    while (currentLookupBlock != null) {
      for (let varDecl of currentLookupBlock.varDecls) {
        if (node.text == varDecl.name) return new HIR.RefToDecl(varDecl, node.range);
      }
      currentLookupBlock = currentLookupBlock.parent;
    }
    return this.error(DiagnosticCode.Cannot_find_name_0, node.range, node.text);
  }

  convertBinaryExpression(node: AST.BinaryExpression): HIR.Expr | null {
    let lhs = this.convertExpression(node.left);
    let rhs = this.convertExpression(node.right);
    if (lhs == null || rhs == null) return null;
    let op: HIR.BinaryOp;
    switch (node.operator) {
      case Token.Plus:
        op = HIR.BinaryOp.add;
        break;
      case Token.Minus:
        op = HIR.BinaryOp.dec;
        break;
      case Token.Asterisk:
        op = HIR.BinaryOp.mul;
        break;
      case Token.Slash:
        op = HIR.BinaryOp.div;
        break;
      case Token.Equals_Equals:
      case Token.Equals_Equals_Equals:
        op = HIR.BinaryOp.equal;
        break;
      case Token.Equals:
        return this.convertBinaryExpressionEqual(node);
      default:
        return this.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    }
    return new HIR.BinaryOperator(op, lhs, rhs, node.range);
  }

  convertBinaryExpressionEqual(node: AST.BinaryExpression): HIR.Expr | null {
    let decl: HIR.VarDecl = this.allocTmpVariable();
    let refToDecl = new HIR.RefToDecl(decl, nativeRange);

    let assigner: HIR.Expr | null = this.convertExpression(node.right);
    if (assigner == null) return null;
    this.currentBlock.stmts.push(new HIR.Assign(refToDecl, assigner, node.range));

    let assignee: HIR.Expr | null = this.convertExpression(node.left);
    if (assignee == null) return null;
    if (!(assignee instanceof HIR.RefToDecl)) return null;
    this.currentBlock.stmts.push(new HIR.Assign(assignee, refToDecl, node.range));

    return refToDecl;
  }

  convertCallExpression(node: AST.CallExpression): HIR.Expr | null {
    let expr = this.convertExpression(node.expression);
    if (expr == null) return null;
    let args: HIR.Expr[] = [];
    for (let arg of node.args) {
      let argExpr = this.convertExpression(arg);
      if (argExpr == null) return null;
      args.push(argExpr);
    }
    return new HIR.Call(expr, args, node.range);
  }

  convertFunctionExpression(node: AST.FunctionExpression): HIR.Expr | null {
    let functionBlock = new HIR.Block(this.currentBlock, node.range);
    this.enterBlock(functionBlock);
    for (let parameter of node.declaration.signature.parameters) {
      if (parameter.parameterKind != AST.ParameterKind.Default) this.error(DiagnosticCode.Not_implemented_0, parameter.range, "convert to HIR");
      if (parameter.initializer) this.error(DiagnosticCode.Not_implemented_0, parameter.initializer.range, "convert to HIR");
      let parameterType: HIR.RefToType | null = null;
      if (parameter.type != null) parameterType = this.convertTypeNode(parameter.type);
      this.currentBlock.varDecls.push(new HIR.VarDecl(parameter.name.text, parameterType, parameter.range));
    }
    this.visitNode(node.declaration.body);
    this.exitBlock();
    return new HIR.FuncExpr(functionBlock, node.range);
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  convertTypeNode(node: AST.TypeNode): HIR.RefToType | null {
    switch (node.kind) {
      case AST.NodeKind.NamedType:
        return this.convertNamedTypeNode(<AST.NamedTypeNode>node);
      case AST.NodeKind.FunctionType:
      default:
        return this.error(DiagnosticCode.Not_implemented_0, node.range, "convert to HIR");
    }
  }

  convertNamedTypeNode(node: AST.NamedTypeNode): HIR.RefToType | null {
    if (node.name.next != null) return this.error(DiagnosticCode.Not_implemented_0, node.name.range, "convert to HIR");
    if (!isArrayEmpty(node.typeArguments)) return this.error(DiagnosticCode.Not_implemented_0, node.name.range, "convert to HIR");
    let name = node.name.identifier.text;
    let decl = this.currentTypeScope.find(name);
    if (decl == null) return this.error(DiagnosticCode.Cannot_find_name_0, node.name.range, name);
    return new HIR.RefToType(decl, node.range);
  }
}
