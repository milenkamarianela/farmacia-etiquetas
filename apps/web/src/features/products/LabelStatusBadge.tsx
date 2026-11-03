import type { LabelStatus } from '@etiquetas/shared';
import { Badge } from '../../components/ui';

const LABELS: Record<LabelStatus, { text: string; tone: 'neutral' | 'success' | 'warning' }> = {
  never: { text: 'Sin imprimir', tone: 'neutral' },
  outdated: { text: 'Precio cambiado', tone: 'warning' },
  current: { text: 'Al día', tone: 'success' },
};

export function LabelStatusBadge({ status }: { status: LabelStatus }) {
  const { text, tone } = LABELS[status];
  return <Badge tone={tone}>{text}</Badge>;
}
