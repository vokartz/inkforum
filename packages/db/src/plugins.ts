import {
  OperationNodeTransformer,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValueNode,
  type PrimitiveValueListNode,
} from 'kysely';

class BooleanToIntTransformer extends OperationNodeTransformer {
  protected override transformValue(node: ValueNode): ValueNode {
    const out = super.transformValue(node);
    return typeof out.value === 'boolean' ? { ...out, value: out.value ? 1 : 0 } : out;
  }

  protected override transformPrimitiveValueList(node: PrimitiveValueListNode): PrimitiveValueListNode {
    const out = super.transformPrimitiveValueList(node);
    return { ...out, values: out.values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v)) };
  }
}

/**
 * Parametre olarak verilen boolean değerleri 1/0'a çevirir.
 * SQLite sürücüleri boolean bağlamayı reddeder; PostgreSQL'de de sütunlar smallint'tir.
 */
export class BooleanToIntPlugin implements KyselyPlugin {
  readonly #transformer = new BooleanToIntTransformer();

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.#transformer.transformNode(args.node);
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }
}
