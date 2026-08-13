import { Fragment } from 'react';
import { Pressable } from 'react-native';
import { resolveComponent } from '@/plugins/catalog';
import type { Condition, ElementNode } from '@/plugins/spec';

/** Interpolate `{{path}}` against a flat context; unknown paths → "". */
export function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const val = path.split('.').reduce<unknown>(
      (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
      ctx,
    );
    return val === undefined || val === null ? '' : String(val);
  });
}

function getValue(field: string, ctx: Record<string, unknown>): unknown {
  return field.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    ctx,
  );
}

export function evalCondition(c: Condition, ctx: Record<string, unknown>): boolean {
  const v = getValue(c.field, ctx);
  if ('is' in c) {
    switch (c.is) {
      case 'truthy': return Boolean(v);
      case 'falsy': return !Boolean(v);
      case 'null': return v === null || v === undefined;
      case 'notNull': return v !== null && v !== undefined;
    }
  }
  if ('eq' in c) return v === c.eq;
  if ('gt' in c) return typeof v === 'number' && v > c.gt;
  if ('lt' in c) return typeof v === 'number' && v < c.lt;
  return false;
}

export interface RenderContext {
  item: Record<string, unknown>;
  derived: Record<string, unknown>;
  color?: string;
  actions?: Record<string, { run: () => void }>;
}

export function renderTree(node: ElementNode, ctx: RenderContext): React.ReactElement | null {
  // Nested context: templates use `{{item.title}}`, `{{derived.timeLabel}}`, `{{color}}`.
  const scope = { item: ctx.item, derived: ctx.derived, color: ctx.color };
  if (node.showIf && !evalCondition(node.showIf, scope)) return null;

  const value = node.value ? interpolate(node.value, scope) : undefined;
  const Component = resolveComponent(node.type);
  const onPress = node.action ? ctx.actions?.[node.action]?.run : undefined;
  const children = (node.children ?? []).map((c) => renderTree(c, ctx)).filter(Boolean) as React.ReactElement[];

  const el = <Component value={value} props={node.props} color={ctx.color}>{children}</Component>;
  return onPress ? <Pressable onPress={onPress}>{el}</Pressable> : el;
}

export function renderList(nodes: ElementNode[], ctx: RenderContext): React.ReactElement {
  return (
    <Fragment>
      {nodes.map((n, i) => <Fragment key={i}>{renderTree(n, ctx)}</Fragment>)}
    </Fragment>
  );
}
