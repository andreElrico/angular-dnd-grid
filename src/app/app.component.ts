import {Component} from '@angular/core';

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
    /* if (event.previousContainer === event.container) {
       // moveItemInArray(event.container.data, event.previousIndex.index, event.currentIndex.index);
     } else {
       transferArrayItem(event.previousContainer.data,
         event.container.data,
         event.previousIndex.index,
         event.currentIndex.index);
     }*/
  }


}
