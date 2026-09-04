import { computed, createApp, ref } from "vue"

const App = {
  setup() {
    const n = ref(0)
    const doubled = computed(() => n.value * 2)
    const parity = computed(() => (n.value % 2 === 0 ? "even" : "odd"))
    return { n, doubled, parity }
  },
  template: `
    <div>
      <button @click="n++">+</button>
      <button @click="n--">-</button>
      <div>count: {{ n }}</div>
      <div>doubled: {{ doubled }}</div>
      <span id="parity">{{ parity }}</span>
    </div>
  `,
}

export function mountApp(container: HTMLElement): void {
  createApp(App).mount(container)
}
