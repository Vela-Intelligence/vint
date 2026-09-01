import { mount, tags } from "../src/index"
import { FetchApp } from "./fetch"
import { TodoApp } from "./todo"

mount(document.body, () => tags.main(TodoApp(), tags.hr(), FetchApp()))
