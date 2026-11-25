// Only the ECharts pieces the stats page uses, so the lazy chunk stays small.
import { BarChart, HeatmapChart } from 'echarts/charts';
import { CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapPiecewiseComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapPiecewiseComponent,
  CanvasRenderer,
]);

// ngx-echarts calls `init` etc. on the imported module, so re-export the configured core.
export * from 'echarts/core';
