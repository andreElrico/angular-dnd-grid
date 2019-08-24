import {Component} from '@angular/core';
import {moveItemInArray, transferArrayItem} from "@angular/cdk/drag-drop";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  grid = [
    {
      value: 11,
      x: 1,
      y: 1,
      width: 2,
      height: 1
    },
    {
      value: 12,
      x: 4,
      y: 2,
      width: 2,
      height: 1
    }
  ];

  drop(event) {
    console.log(event);
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    }
  }


}
